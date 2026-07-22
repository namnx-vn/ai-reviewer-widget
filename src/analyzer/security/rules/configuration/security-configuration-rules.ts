import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../../model/types";

type RuleKind =
  | "debug-enabled"
  | "production-stacktrace"
  | "cors-wildcard"
  | "default-credential"
  | "unsafe-csp"
  | "production-source-map"
  | "admin-interface"
  | "development-mode";

interface Match {
  readonly kind: RuleKind;
  readonly node: TSESTree.Node;
  readonly evidence: string;
}

interface KnownApis {
  readonly expressApps: ReadonlySet<string>;
  readonly corsCalls: ReadonlySet<string>;
  readonly helmetCalls: ReadonlySet<string>;
  readonly basicAuthCalls: ReadonlySet<string>;
}

const METAS: Readonly<Record<RuleKind, SecurityRuleMeta>> = {
  "debug-enabled": meta("security.config.debug-enabled", "Debug mode enabled", "medium", "CWE-489"),
  "production-stacktrace": meta("security.config.production-stacktrace", "Production stack traces enabled", "high", "CWE-209"),
  "cors-wildcard": meta("security.config.cors-wildcard", "Wildcard CORS origin", "medium", "CWE-942"),
  "default-credential": meta("security.config.default-credential", "Default credential configured", "critical", "CWE-798"),
  "unsafe-csp": meta("security.config.unsafe-csp", "Unsafe content security policy", "high", "CWE-693"),
  "production-source-map": meta("security.config.production-source-map", "Production source maps enabled", "low", "CWE-200"),
  "admin-interface": meta("security.config.admin-interface", "Admin interface exposed", "medium", "CWE-284"),
  "development-mode": meta("security.config.development-mode", "Development mode enabled", "medium", "CWE-489"),
};

export const securityConfigurationRules: readonly SecurityRule[] = (
  Object.keys(METAS) as RuleKind[]
).map((kind) => ({
  meta: METAS[kind],
  check(context) {
    return findMatches(context.ast)
      .filter((match) => match.kind === kind)
      .map((match) => createFinding(context, match));
  },
}));

function findMatches(ast: TSESTree.Program): readonly Match[] {
  const apis = collectKnownApis(ast);
  const productionApps = collectAppsWithEnvironment(ast, apis.expressApps, "production");
  const matches: Match[] = [];
  visit(ast, (node) => {
    if (node.type === "CallExpression") {
      inspectExpressConfiguration(node, apis.expressApps, productionApps, matches);
      inspectKnownMiddleware(node, apis, matches);
    }
    if (node.type === "ObjectExpression") inspectWebpackConfiguration(node, matches);
  });
  return unique(matches);
}

function collectKnownApis(ast: TSESTree.Program): KnownApis {
  const expressFactories = new Set<string>();
  const corsCalls = new Set<string>();
  const helmetCalls = new Set<string>();
  const basicAuthCalls = new Set<string>();
  const expressApps = new Set<string>();
  visit(ast, (node) => {
    if (node.type === "ImportDeclaration") {
      const module = stringValue(node.source);
      for (const specifier of node.specifiers) {
        if (specifier.type !== "ImportDefaultSpecifier") continue;
        if (module === "express") expressFactories.add(specifier.local.name);
        if (module === "cors") corsCalls.add(specifier.local.name);
        if (module === "helmet") helmetCalls.add(specifier.local.name);
        if (module === "express-basic-auth") basicAuthCalls.add(specifier.local.name);
      }
      return;
    }
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init?.type === "CallExpression" &&
      node.init.callee.type === "Identifier" &&
      expressFactories.has(node.init.callee.name)
    ) expressApps.add(node.id.name);
  });
  return { expressApps, corsCalls, helmetCalls, basicAuthCalls };
}

function collectAppsWithEnvironment(
  ast: TSESTree.Program,
  apps: ReadonlySet<string>,
  environment: string,
): ReadonlySet<string> {
  const result = new Set<string>();
  visit(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const member = memberCall(node.callee);
    if (
      member?.property === "set" &&
      apps.has(member.object) &&
      stringValue(argumentAt(node, 0)) === "env" &&
      stringValue(argumentAt(node, 1)) === environment
    ) result.add(member.object);
  });
  return result;
}

function inspectExpressConfiguration(
  node: TSESTree.CallExpression,
  apps: ReadonlySet<string>,
  productionApps: ReadonlySet<string>,
  matches: Match[],
): void {
  const member = memberCall(node.callee);
  if (member === undefined || !apps.has(member.object)) return;
  if (member.property === "set") {
    const key = stringValue(argumentAt(node, 0));
    const value = argumentAt(node, 1);
    if (key === "env" && stringValue(value) === "development") {
      matches.push({ kind: "development-mode", node: value ?? node, evidence: "Express environment is explicitly set to development." });
    }
    if (productionApps.has(member.object) && key === "debug" && booleanValue(value) === true) {
      matches.push({ kind: "debug-enabled", node: value ?? node, evidence: "Debug mode is explicitly enabled for an Express app configured for production." });
    }
    if (productionApps.has(member.object) && key === "showStackError" && booleanValue(value) === true) {
      matches.push({ kind: "production-stacktrace", node: value ?? node, evidence: "Stack trace errors are explicitly enabled for an Express app configured for production." });
    }
  }
  if (member.property === "use" && isAdminPath(stringValue(argumentAt(node, 0)))) {
    matches.push({ kind: "admin-interface", node: argumentAt(node, 0) ?? node, evidence: "A known Express app mounts an explicit admin interface route." });
  }
}

function inspectKnownMiddleware(node: TSESTree.CallExpression, apis: KnownApis, matches: Match[]): void {
  if (node.callee.type !== "Identifier") return;
  const options = argumentAt(node, 0);
  if (apis.corsCalls.has(node.callee.name) && isWildcardCors(options))
    matches.push({ kind: "cors-wildcard", node: options ?? node, evidence: "Known CORS middleware explicitly allows every origin." });
  if (apis.helmetCalls.has(node.callee.name) && isUnsafeCsp(options))
    matches.push({ kind: "unsafe-csp", node: options ?? node, evidence: "Known Helmet middleware explicitly disables or weakens CSP." });
  if (apis.basicAuthCalls.has(node.callee.name) && hasDefaultBasicCredential(options))
    matches.push({ kind: "default-credential", node: options ?? node, evidence: "Known basic-auth middleware contains an explicit default credential." });
}

function inspectWebpackConfiguration(node: TSESTree.ObjectExpression, matches: Match[]): void {
  if (stringValue(objectValue(node, "mode")) !== "production") return;
  const devtool = stringValue(objectValue(node, "devtool"));
  if (devtool !== undefined && /source-map$/i.test(devtool))
    matches.push({ kind: "production-source-map", node: objectValue(node, "devtool") ?? node, evidence: "A production webpack configuration explicitly publishes source maps." });
}

function isWildcardCors(node: TSESTree.Node | undefined): boolean {
  return node?.type === "ObjectExpression" && stringValue(objectValue(node, "origin")) === "*";
}

function isUnsafeCsp(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== "ObjectExpression") return false;
  const csp = objectValue(node, "contentSecurityPolicy");
  if (booleanValue(csp) === false) return true;
  if (csp?.type !== "ObjectExpression") return false;
  const directives = objectValue(csp, "directives");
  return directives?.type === "ObjectExpression" && ["defaultSrc", "scriptSrc", "styleSrc"].some((name) => hasUnsafeDirective(objectValue(directives, name)));
}

function hasUnsafeDirective(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== "ArrayExpression") return false;
  return node.elements.some((entry) => entry !== null && entry.type !== "SpreadElement" && ["*", "'unsafe-inline'", "'unsafe-eval'"].includes(stringValue(entry) ?? ""));
}

function hasDefaultBasicCredential(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== "ObjectExpression") return false;
  const users = objectValue(node, "users");
  if (users?.type !== "ObjectExpression") return false;
  return users.properties.some((property) => {
    if (property.type !== "Property" || property.computed) return false;
    const username = stringValue(property.key);
    const password = stringValue(property.value);
    return username !== undefined && password !== undefined && isDefaultCredential(username, password);
  });
}

function isDefaultCredential(username: string, password: string): boolean {
  return (username === "admin" && ["admin", "password", "123456"].includes(password)) || (username === "root" && password === "root");
}

function isAdminPath(value: string | undefined): boolean {
  return value === "/admin" || value === "/administrator" || value === "/admin-panel";
}

function memberCall(node: TSESTree.Node): { readonly object: string; readonly property: string } | undefined {
  if (node.type !== "MemberExpression" || node.computed || node.object.type !== "Identifier") return undefined;
  const property = node.property.type === "Identifier" ? node.property.name : undefined;
  return property === undefined ? undefined : { object: node.object.name, property };
}
function argumentAt(node: TSESTree.CallExpression, index: number): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument?.type === "SpreadElement" ? undefined : argument;
}
function objectValue(node: TSESTree.ObjectExpression, name: string): TSESTree.Node | undefined {
  const property = node.properties.find((entry) => entry.type === "Property" && !entry.computed && stringValue(entry.key) === name);
  return property?.type === "Property" ? property.value : undefined;
}
function stringValue(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;
  if (node?.type === "Identifier") return node.name;
  return undefined;
}
function booleanValue(node: TSESTree.Node | undefined): boolean | undefined {
  return node?.type === "Literal" && typeof node.value === "boolean" ? node.value : undefined;
}
function unique(matches: readonly Match[]): readonly Match[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.kind}:${match.node.range?.join("-") ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function meta(id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta {
  return { id, title, description: `${title} is explicitly configured.`, category: "configuration", defaultSeverity: severity, defaultConfidence: "high", standards: [{ standard: "cwe", id: cwe }] };
}
function createFinding(context: SecurityRuleContext, match: Match): SecurityFinding {
  const rule = METAS[match.kind];
  const location = { path: context.file, line: match.node.loc?.start.line, column: match.node.loc?.start.column, range: { start: match.node.range?.[0] ?? 0, end: match.node.range?.[1] ?? 0 } };
  return { id: createSecurityFindingId({ ruleId: rule.id, path: context.file, range: location.range, sinkKind: "unknown" }), ruleId: rule.id, title: rule.title, message: rule.description, category: "configuration", severity: rule.defaultSeverity, confidence: rule.defaultConfidence, location, evidence: [{ message: match.evidence, location }], standards: rule.standards, suggestion: "Use an explicit production-safe configuration appropriate for this deployment." };
}
function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void {
  visitor(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) visit(value, visitor);
    else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item, visitor);
  }
}
function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}
