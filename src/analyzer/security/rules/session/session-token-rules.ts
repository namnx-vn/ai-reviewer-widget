import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../../model/types";

type RuleKind =
  | "local-storage-token" | "session-storage-token" | "cookie-http-only"
  | "cookie-secure" | "cookie-same-site" | "token-in-url"
  | "predictable-session-id" | "none-algorithm" | "unverified"
  | "exp-validation" | "issuer-validation" | "audience-validation" | "weak-secret";

interface Match { readonly kind: RuleKind; readonly node: TSESTree.Node; readonly evidence: string; }

const METAS: Readonly<Record<RuleKind, SecurityRuleMeta>> = {
  "local-storage-token": meta("security.session.local-storage-token", "Token stored in localStorage", "medium", "CWE-922"),
  "session-storage-token": meta("security.session.session-storage-token", "Token stored in sessionStorage", "medium", "CWE-922"),
  "cookie-http-only": meta("security.session.cookie-http-only", "Cookie missing httpOnly", "high", "CWE-1004"),
  "cookie-secure": meta("security.session.cookie-secure", "Cookie missing secure", "high", "CWE-614"),
  "cookie-same-site": meta("security.session.cookie-same-site", "Cookie missing sameSite", "medium", "CWE-1275"),
  "token-in-url": meta("security.session.token-in-url", "Token included in URL", "high", "CWE-598"),
  "predictable-session-id": meta("security.session.predictable-session-id", "Predictable session identifier", "high", "CWE-330"),
  "none-algorithm": meta("security.jwt.none-algorithm", "JWT accepts none algorithm", "critical", "CWE-347"),
  "unverified": meta("security.jwt.unverified", "JWT decoded without verification", "high", "CWE-347"),
  "exp-validation": meta("security.jwt.exp-validation", "JWT expiration validation disabled", "high", "CWE-613"),
  "issuer-validation": meta("security.jwt.issuer-validation", "JWT issuer is not validated", "medium", "CWE-345"),
  "audience-validation": meta("security.jwt.audience-validation", "JWT audience is not validated", "medium", "CWE-345"),
  "weak-secret": meta("security.jwt.weak-secret", "Weak JWT signing secret", "critical", "CWE-798"),
};

export const sessionTokenRules: readonly SecurityRule[] = (Object.keys(METAS) as RuleKind[]).map((kind) => ({
  meta: METAS[kind],
  check(context) { return findMatches(context).filter((match) => match.kind === kind).map((match) => createFinding(context, match)); },
}));

function meta(id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta {
  return { id, title, description: `${title} is detected from a known session or JWT API configuration.`, category: "session", defaultSeverity: severity, defaultConfidence: "high", standards: [{ standard: "cwe", id: cwe }] };
}

function findMatches(context: SecurityRuleContext): readonly Match[] {
  const jwtAliases = collectJwtAliases(context.ast);
  const matches: Match[] = [];
  visit(context.ast, (node) => {
    if (node.type === "CallExpression") inspectCall(node, jwtAliases, matches);
    if (node.type === "VariableDeclarator") inspectSessionId(node, matches);
  });
  return unique(matches);
}

function inspectCall(node: TSESTree.CallExpression, jwtAliases: JwtAliases, matches: Match[]): void {
  const member = memberCall(node.callee);
  if (member?.property === "setItem" && member.object === "localStorage" && isSensitiveStorageKey(node.arguments[0])) matches.push({ kind: "local-storage-token", node, evidence: "A token-like value is persisted through localStorage.setItem()." });
  if (member?.property === "setItem" && member.object === "sessionStorage" && isSensitiveStorageKey(node.arguments[0])) matches.push({ kind: "session-storage-token", node, evidence: "A token-like value is persisted through sessionStorage.setItem()." });
  if (isCookieCreationCall(member)) inspectCookieOptions(node, matches);
  if (isUrlRequestCall(member, node.callee) && hasTokenUrl(node.arguments[0])) matches.push({ kind: "token-in-url", node, evidence: "A token-like query parameter is sent in a request URL." });
  const jwtOperation = jwtOperationOf(node.callee, jwtAliases);
  if (jwtOperation === "decode") matches.push({ kind: "unverified", node, evidence: "Known JWT decode API reads claims without signature verification." });
  if (jwtOperation === "verify") inspectVerifyOptions(node, matches);
  if (jwtOperation === "sign") inspectJwtSigning(node, matches);
}

function inspectCookieOptions(node: TSESTree.CallExpression, matches: Match[]): void {
  const options = node.arguments[2];
  if (options?.type !== "ObjectExpression") return;
  const properties = propertyMap(options);
  if (properties.get("httpOnly") !== true) matches.push({ kind: "cookie-http-only", node, evidence: "Cookie creation does not set httpOnly: true." });
  if (properties.get("secure") !== true) matches.push({ kind: "cookie-secure", node, evidence: "Cookie creation does not set secure: true." });
  if (!hasSameSite(properties)) matches.push({ kind: "cookie-same-site", node, evidence: "Cookie creation does not set a restrictive sameSite value." });
}

function inspectVerifyOptions(node: TSESTree.CallExpression, matches: Match[]): void {
  const options = node.arguments[2];
  if (options?.type !== "ObjectExpression") return;
  const properties = propertyMap(options);
  if (properties.get("ignoreExpiration") === true || properties.get("ignoreNotBefore") === true) matches.push({ kind: "exp-validation", node, evidence: "JWT verification explicitly disables time-claim validation." });
  if (hasNoneAlgorithm(properties)) matches.push({ kind: "none-algorithm", node, evidence: "JWT verification explicitly allows the none algorithm." });
  if (!properties.has("issuer")) matches.push({ kind: "issuer-validation", node, evidence: "Static JWT verification options do not constrain the issuer." });
  if (!properties.has("audience")) matches.push({ kind: "audience-validation", node, evidence: "Static JWT verification options do not constrain the audience." });
}

function inspectJwtSigning(node: TSESTree.CallExpression, matches: Match[]): void {
  const secret = node.arguments[1];
  if (isWeakLiteralSecret(secret)) matches.push({ kind: "weak-secret", node, evidence: "JWT signing uses a short literal secret." });
  const options = node.arguments[2];
  if (options?.type === "ObjectExpression" && hasNoneAlgorithm(propertyMap(options))) matches.push({ kind: "none-algorithm", node, evidence: "JWT signing explicitly selects the none algorithm." });
}

function inspectSessionId(node: TSESTree.VariableDeclarator, matches: Match[]): void {
  if (node.id.type === "Identifier" && /(?:session|sid)(?:id|token)?/i.test(node.id.name) && node.init !== null && containsMathRandom(node.init)) matches.push({ kind: "predictable-session-id", node, evidence: "A session identifier is derived from Math.random()." });
}

interface JwtAliases { readonly decode: ReadonlySet<string>; readonly verify: ReadonlySet<string>; readonly sign: ReadonlySet<string>; }
function collectJwtAliases(ast: TSESTree.Program): JwtAliases {
  const result = { decode: new Set(["jwt.decode"]), verify: new Set(["jwt.verify"]), sign: new Set(["jwt.sign"]) };
  visit(ast, (node) => { if (node.type === "ImportDeclaration" && (node.source.value === "jsonwebtoken" || node.source.value === "jose")) for (const specifier of node.specifiers) { if (specifier.type === "ImportNamespaceSpecifier") { result.decode.add(`${specifier.local.name}.decode`); result.verify.add(`${specifier.local.name}.verify`); result.sign.add(`${specifier.local.name}.sign`); } if (specifier.type === "ImportSpecifier") { const imported = nameOf(specifier.imported); if (imported === "decode" || imported === "verify" || imported === "sign") result[imported].add(specifier.local.name); } } });
  return result;
}
function jwtOperationOf(callee: TSESTree.Node, aliases: JwtAliases): "decode" | "verify" | "sign" | undefined { const name = calleeName(callee); if (name === undefined) return undefined; if (aliases.decode.has(name)) return "decode"; if (aliases.verify.has(name)) return "verify"; return aliases.sign.has(name) ? "sign" : undefined; }
function isCookieCreationCall(member: { readonly object: string; readonly property: string } | undefined): boolean { return member !== undefined && (member.property === "cookie" || member.property === "setCookie") && /^(?:res|response|reply|cookies)$/i.test(member.object); }
function isUrlRequestCall(member: { readonly object: string; readonly property: string } | undefined, callee: TSESTree.Node): boolean { return callee.type === "Identifier" && callee.name === "fetch" || member !== undefined && ((member.object === "axios" && ["get", "post", "put", "delete", "request"].includes(member.property)) || ["fetch", "request"].includes(member.property)); }
function hasTokenUrl(argument: TSESTree.CallExpressionArgument | undefined): boolean { return argument?.type === "TemplateLiteral" ? /(?:access_?token|id_?token|token|jwt)=/i.test(argument.quasis.map((part) => part.value.cooked ?? "").join("")) && argument.expressions.length > 0 : argument?.type === "Literal" && typeof argument.value === "string" && /(?:access_?token|id_?token|token|jwt)=[^&]+/i.test(argument.value); }
function isSensitiveStorageKey(node: TSESTree.CallExpressionArgument | undefined): boolean { return node?.type === "Literal" && typeof node.value === "string" && /(?:access_?token|refresh_?token|id_?token|token|jwt|session)/i.test(node.value); }
function propertyMap(node: TSESTree.ObjectExpression): ReadonlyMap<string, boolean | TSESTree.Node> { const values = new Map<string, boolean | TSESTree.Node>(); for (const property of node.properties) if (property.type === "Property" && !property.computed) { const name = nameOf(property.key); if (name !== undefined) values.set(name, property.value.type === "Literal" && typeof property.value.value === "boolean" ? property.value.value : property.value); } return values; }
function hasSameSite(properties: ReadonlyMap<string, boolean | TSESTree.Node>): boolean { const value = properties.get("sameSite"); return value?.type === "Literal" && typeof value.value === "string" && /^(?:lax|strict|none)$/i.test(value.value); }
function hasNoneAlgorithm(properties: ReadonlyMap<string, boolean | TSESTree.Node>): boolean { const algorithms = properties.get("algorithms") ?? properties.get("algorithm"); if (algorithms?.type === "Literal") return algorithms.value === "none"; return algorithms?.type === "ArrayExpression" && algorithms.elements.some((element) => element?.type === "Literal" && element.value === "none"); }
function isWeakLiteralSecret(node: TSESTree.CallExpressionArgument | undefined): boolean { return node?.type === "Literal" && typeof node.value === "string" && node.value.length < 32; }
function containsMathRandom(node: TSESTree.Node): boolean { let found = false; visit(node, (child) => { if (calleeName(child) === "Math.random") found = true; }); return found; }
function memberCall(node: TSESTree.Node): { readonly object: string; readonly property: string } | undefined { if (node.type !== "MemberExpression" || node.computed || node.object.type !== "Identifier" || node.property.type !== "Identifier") return undefined; return { object: node.object.name, property: node.property.name }; }
function calleeName(node: TSESTree.Node): string | undefined { if (node.type === "Identifier") return node.name; const member = memberCall(node); return member === undefined ? undefined : `${member.object}.${member.property}`; }
function nameOf(node: TSESTree.Node): string | undefined { return node.type === "Identifier" ? node.name : node.type === "Literal" && typeof node.value === "string" ? node.value : undefined; }
function locationOf(node: TSESTree.Node, file: string): SecurityFinding["location"] { return { path: file, line: node.loc?.start.line, column: node.loc?.start.column, range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] } }; }
function createFinding(context: SecurityRuleContext, match: Match): SecurityFinding { const metaForMatch = METAS[match.kind]; const location = locationOf(match.node, context.file); return { id: createSecurityFindingId({ ruleId: metaForMatch.id, path: context.file, range: location.range }), ruleId: metaForMatch.id, title: metaForMatch.title, message: metaForMatch.description, severity: metaForMatch.defaultSeverity, confidence: metaForMatch.defaultConfidence, category: "session", location, evidence: [{ message: match.evidence, location }], standards: metaForMatch.standards, suggestion: "Use explicit, secure session and JWT configuration for this operation." }; }
function unique(matches: readonly Match[]): readonly Match[] { const seen = new Set<string>(); return matches.filter((match) => { const key = `${match.kind}:${match.node.range?.join("-") ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void { visitor(node); for (const value of Object.values(node)) { if (isNode(value)) visit(value, visitor); else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item, visitor); } }
function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"; }
