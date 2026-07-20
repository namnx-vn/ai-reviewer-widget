import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import type { SecurityFinding, SecurityRule, SecurityRuleContext, SecurityRuleMeta } from "../../model/types";

type AuthKind = "hardcoded-credential" | "plaintext-password" | "weak-password-storage" | "authentication-bypass" | "client-side-auth" | "user-enumeration" | "password-reset-token" | "oauth-state-missing" | "oauth-pkce-missing" | "jwt-decode-without-verify";
interface Match { readonly kind: AuthKind; readonly node: TSESTree.Node; readonly evidence: string; }

const META: Readonly<Record<AuthKind, SecurityRuleMeta>> = {
  "hardcoded-credential": meta("security.auth.hardcoded-credential", "Hardcoded authentication credential", "high", "CWE-798"),
  "plaintext-password": meta("security.auth.plaintext-password", "Plaintext password persistence", "critical", "CWE-256"),
  "weak-password-storage": meta("security.auth.weak-password-storage", "Weak password storage", "high", "CWE-328"),
  "authentication-bypass": meta("security.auth.authentication-bypass", "Authentication bypass", "critical", "CWE-287"),
  "client-side-auth": meta("security.auth.client-side-auth", "Client-side authentication decision", "high", "CWE-602"),
  "user-enumeration": meta("security.auth.user-enumeration", "User enumeration response", "medium", "CWE-204"),
  "password-reset-token": meta("security.auth.password-reset-token", "Predictable password reset token", "critical", "CWE-330"),
  "oauth-state-missing": meta("security.auth.oauth-state-missing", "OAuth state missing", "high", "CWE-352"),
  "oauth-pkce-missing": meta("security.auth.oauth-pkce-missing", "OAuth PKCE missing", "high", "CWE-347"),
  "jwt-decode-without-verify": meta("security.auth.jwt-decode-without-verify", "JWT decoded without verification", "critical", "CWE-347"),
};

export const authenticationRules: readonly SecurityRule[] = (Object.keys(META) as AuthKind[]).map((kind) => ({
  meta: META[kind],
  check(context) { return analyze(context).filter((match) => match.kind === kind).map((match) => finding(context, match)); },
}));

function meta(id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta {
  return { id, title, description: `${title} is detected from a deterministic local pattern.`, category: "authentication", defaultSeverity: severity, defaultConfidence: "high", standards: [{ standard: "cwe", id: cwe }] };
}

function analyze(context: SecurityRuleContext): readonly Match[] {
  const matches: Match[] = [];
  const decodeAliases = collectDecodeAliases(context.ast);
  const client = /^\s*["']use client["']/m.test(context.source);
  visit(context.ast, (node) => {
    if (node.type === "ObjectExpression") inspectObject(node, matches);
    if (node.type === "CallExpression") inspectCall(node, matches, decodeAliases, context.source);
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init !== null) inspectVariable(node, matches);
    if (node.type === "IfStatement") inspectIf(node, matches, client);
  });
  return unique(matches);
}

function inspectObject(node: TSESTree.ObjectExpression, matches: Match[]): void {
  const properties = propertiesOf(node);
  const password = properties.get("password");
  if (password !== undefined && isString(password) && (properties.has("username") || properties.has("email"))) matches.push({ kind: "hardcoded-credential", node, evidence: "Credential object contains a literal password." });
  if (properties.has("password") && !isString(password)) matches.push({ kind: "plaintext-password", node, evidence: "Password field is passed to a persistence-like object." });
}

function inspectCall(node: TSESTree.CallExpression, matches: Match[], decodeAliases: ReadonlySet<string>, source: string): void {
  const name = callName(node.callee);
  if (name === "createHash" && node.arguments.some((argument) => isWeakHash(argument))) matches.push({ kind: "weak-password-storage", node, evidence: "A weak hash is used in a password-related hash operation." });
  if (name === "authorize") inspectOAuth(node, matches);
  if (isDecodeCall(node.callee, decodeAliases) && hasAuthenticationDecision(source)) matches.push({ kind: "jwt-decode-without-verify", node, evidence: "Decoded JWT claims are used with an authentication decision; decode does not verify signatures." });
}

function inspectVariable(node: TSESTree.VariableDeclarator, matches: Match[]): void {
  if (node.id.type !== "Identifier") return;
  if (node.init !== null && /(?:password)?reset(?:token|code)|reset(?:token|code)/i.test(node.id.name) && containsMathRandom(node.init)) matches.push({ kind: "password-reset-token", node, evidence: "Password reset value is derived from Math.random()." });
}

function inspectIf(node: TSESTree.IfStatement, matches: Match[], client: boolean): void {
  const testText = nodeText(node.test);
  const consequentText = nodeText(node.consequent);
  if (/(?:skipAuth|bypassAuth|disableAuth)/i.test(testText) && /next|allow|return/i.test(consequentText)) matches.push({ kind: "authentication-bypass", node, evidence: "Authentication bypass flag controls an allow/next path." });
  if (client && /localStorage|sessionStorage/.test(testText) && /(?:admin|auth|signed|role)/i.test(testText)) matches.push({ kind: "client-side-auth", node, evidence: "Browser storage directly controls an authentication-sensitive branch." });
  if ((/"operator":"!"/.test(testText) && /"name":"user"/.test(testText) || /user\s*===\s*(?:null|undefined)/.test(testText)) && /(?:404|not found|user not found)/i.test(consequentText)) matches.push({ kind: "user-enumeration", node, evidence: "A user-not-found branch returns distinguishable account information." });
}

function inspectOAuth(node: TSESTree.CallExpression, matches: Match[]): void {
  const options = node.arguments.find((argument): argument is TSESTree.ObjectExpression => argument.type === "ObjectExpression");
  if (options === undefined) return;
  const properties = propertiesOf(options);
  if (!hasCodeResponse(properties)) return;
  if (!properties.has("state")) matches.push({ kind: "oauth-state-missing", node, evidence: "OAuth authorization-code request has no state parameter." });
  if (!(properties.has("codeChallenge") || properties.has("code_challenge"))) matches.push({ kind: "oauth-pkce-missing", node, evidence: "OAuth authorization-code request has no PKCE code challenge." });
}

function collectDecodeAliases(ast: TSESTree.Program): ReadonlySet<string> {
  const aliases = new Set(["decode"]);
  visit(ast, (node) => { if (node.type === "ImportDeclaration" && (node.source.value === "jsonwebtoken" || node.source.value === "jose")) for (const specifier of node.specifiers) { if (specifier.type === "ImportSpecifier" && nameOf(specifier.imported) === "decode") aliases.add(specifier.local.name); if (specifier.type === "ImportNamespaceSpecifier") aliases.add(`${specifier.local.name}.decode`); } });
  return aliases;
}

function finding(context: SecurityRuleContext, match: Match): SecurityFinding {
  const location = locationOf(match.node, context.file); const metaForMatch = META[match.kind];
  return { id: createSecurityFindingId({ ruleId: metaForMatch.id, path: context.file, range: location.range, sinkKind: "unknown" }), ruleId: metaForMatch.id, title: metaForMatch.title, message: metaForMatch.description, severity: metaForMatch.defaultSeverity, confidence: metaForMatch.defaultConfidence, category: "authentication", location, evidence: [{ message: match.evidence, location }], standards: metaForMatch.standards, suggestion: "Use an explicit, server-enforced authentication control appropriate for this operation." };
}

function propertiesOf(node: TSESTree.ObjectExpression): ReadonlyMap<string, TSESTree.Node> { const entries: [string, TSESTree.Node][] = []; for (const property of node.properties) if (property.type === "Property" && !property.computed) { const name = nameOf(property.key); if (name !== undefined) entries.push([name, property.value]); } return new Map(entries); }
function hasCodeResponse(properties: ReadonlyMap<string, TSESTree.Node>): boolean { const value = properties.get("responseType") ?? properties.get("response_type"); return isString(value) && value.value === "code"; }
function isString(node: TSESTree.Node | undefined): node is TSESTree.Literal { return node?.type === "Literal" && typeof node.value === "string"; }
function isWeakHash(node: TSESTree.CallExpressionArgument): boolean { return node.type === "Literal" && typeof node.value === "string" && /^(?:md5|sha1)$/i.test(node.value); }
function callName(node: TSESTree.Node): string | undefined { if (node.type === "Identifier") return node.name; if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") return node.property.name; return undefined; }
function isDecodeCall(node: TSESTree.Node, aliases: ReadonlySet<string>): boolean { if (node.type === "Identifier") return aliases.has(node.name); if (node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" && node.property.type === "Identifier") return aliases.has(`${node.object.name}.${node.property.name}`) || (node.object.name === "jwt" && node.property.name === "decode"); return false; }
function containsMathRandom(node: TSESTree.Node): boolean { let found = false; visit(node, (child) => { if (child.type === "CallExpression" && child.callee.type === "MemberExpression" && child.callee.object.type === "Identifier" && child.callee.object.name === "Math" && child.callee.property.type === "Identifier" && child.callee.property.name === "random") found = true; }); return found; }
function hasAuthenticationDecision(source: string): boolean { return /\bif\s*\(/.test(source) && /\b(?:next|allow|admin|authenticated|role|sub)\b/i.test(source); }
function nodeText(node: TSESTree.Node): string { return JSON.stringify(node); }
function nameOf(node: TSESTree.Node): string | undefined { return node.type === "Identifier" ? node.name : node.type === "Literal" && typeof node.value === "string" ? node.value : undefined; }
function locationOf(node: TSESTree.Node, file: string): SecurityFinding["location"] { return { path: file, line: node.loc?.start.line, column: node.loc?.start.column, range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] } }; }
function unique(matches: readonly Match[]): readonly Match[] { const keys = new Set<string>(); return matches.filter((match) => { const key = `${match.kind}:${match.node.range?.join("-") ?? ""}`; if (keys.has(key)) return false; keys.add(key); return true; }); }
function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void { visitor(node); for (const value of Object.values(node)) { if (isNode(value)) visit(value, visitor); else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item, visitor); } }
function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"; }
