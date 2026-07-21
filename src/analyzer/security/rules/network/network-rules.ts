import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
  SecurityStandardMapping,
} from "../../model/types";

type NetworkKind =
  | "insecure-http"
  | "insecure-websocket"
  | "tls-verification-disabled"
  | "weak-tls"
  | "permissive-cors"
  | "credentials-wildcard-origin"
  | "untrusted-proxy";

interface NetworkMatch {
  readonly kind: NetworkKind;
  readonly node: TSESTree.Node;
  readonly evidence: string;
}

interface ModelState {
  readonly httpNamespaces: ReadonlySet<string>;
  readonly httpCalls: ReadonlySet<string>;
  readonly tlsNamespaces: ReadonlySet<string>;
  readonly tlsCalls: ReadonlySet<string>;
  readonly corsCalls: ReadonlySet<string>;
  readonly expressCalls: ReadonlySet<string>;
  readonly expressApps: ReadonlySet<string>;
  readonly proxySetCalls: ReadonlySet<string>;
}

const HTTP_MODULES = new Set(["http", "node:http", "https", "node:https"]);
const TLS_MODULES = new Set(["tls", "node:tls", "https", "node:https"]);
const TLS_METHODS = new Set(["request", "get", "createServer", "connect"]);
const WEAK_TLS = new Set(["tlsv1", "tlsv1.0", "tlsv1.1", "sslv2", "sslv3"]);

const METAS: Readonly<Record<NetworkKind, SecurityRuleMeta>> = {
  "insecure-http": meta("security.network.insecure-http", "Insecure HTTP transport", "high", "CWE-319"),
  "insecure-websocket": meta("security.network.insecure-websocket", "Insecure WebSocket transport", "high", "CWE-319"),
  "tls-verification-disabled": meta("security.network.tls-verification-disabled", "TLS certificate verification disabled", "high", "CWE-295"),
  "weak-tls": meta("security.network.weak-tls", "Weak TLS version", "high", "CWE-326"),
  "permissive-cors": meta("security.network.permissive-cors", "Permissive CORS origin", "medium", "CWE-942"),
  "credentials-wildcard-origin": meta("security.network.credentials-wildcard-origin", "CORS credentials with wildcard origin", "high", "CWE-942"),
  "untrusted-proxy": meta("security.network.untrusted-proxy", "Overly broad trusted proxy", "medium", "CWE-441"),
};

export const networkTransportRules: readonly SecurityRule[] = (Object.keys(METAS) as NetworkKind[]).map((kind) => ({
  meta: METAS[kind],
  check(context) {
    return collectMatches(context.ast)
      .filter((match) => match.kind === kind)
      .map((match) => createFinding(context, match));
  },
}));

function collectMatches(ast: TSESTree.Program): readonly NetworkMatch[] {
  const state = buildModelState(ast);
  const matches: NetworkMatch[] = [];
  visit(ast, (node) => {
    if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
    const callee = node.callee;
    const name = calleeName(callee);
    const path = memberPath(callee);
    const first = argumentAt(node, 0);

    if (isHttpCall(name, path, state)) addInsecureUrl(matches, first, node);
    if (isWebSocketCall(name, path)) addWebSocketUrl(matches, first, node);
    if (isTlsCall(name, path, state)) addTlsOptions(matches, optionsArgument(node));
    if (node.type === "CallExpression" && state.corsCalls.has(name ?? "")) addCorsOptions(matches, argumentAt(node, 0));
    if (node.type === "CallExpression" && isProxySetCall(name, path, state)) addProxySetting(matches, node);
  });
  return unique(matches);
}

function buildModelState(ast: TSESTree.Program): ModelState {
  const httpNamespaces = new Set<string>();
  const httpCalls = new Set<string>();
  const tlsNamespaces = new Set<string>();
  const tlsCalls = new Set<string>();
  const corsCalls = new Set<string>();
  const expressCalls = new Set<string>();
  const expressApps = new Set<string>();
  const proxySetCalls = new Set<string>();

  visit(ast, (node) => {
    if (node.type === "ImportDeclaration") {
      const module = stringValue(node.source);
      if (module === undefined) return;
      for (const specifier of node.specifiers) {
        const local = specifier.local.name;
        if (HTTP_MODULES.has(module)) {
          if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") httpNamespaces.add(local);
          else if (TLS_METHODS.has(importedName(specifier))) httpCalls.add(local);
        }
        if (TLS_MODULES.has(module)) {
          if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") tlsNamespaces.add(local);
          else if (TLS_METHODS.has(importedName(specifier))) tlsCalls.add(local);
        }
        if (module === "cors" && (specifier.type === "ImportDefaultSpecifier" || importedName(specifier) === "default" || importedName(specifier) === "cors")) corsCalls.add(local);
        if (module === "express" && (specifier.type === "ImportDefaultSpecifier" || importedName(specifier) === "default")) expressCalls.add(local);
      }
      return;
    }

    if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier" || node.init === null) return;
    const name = node.id.name;
    if (node.init.type === "CallExpression" && expressCalls.has(calleeName(node.init.callee) ?? "")) expressApps.add(name);
    if (node.init.type === "MemberExpression" && node.init.object.type === "Identifier" && expressApps.has(node.init.object.name) && propertyName(node.init.property) === "set") proxySetCalls.add(name);
  });
  return { httpNamespaces, httpCalls, tlsNamespaces, tlsCalls, corsCalls, expressCalls, expressApps, proxySetCalls };
}

function addInsecureUrl(matches: NetworkMatch[], value: TSESTree.Node | undefined, fallback: TSESTree.Node): void {
  const url = stringValue(value);
  if (url !== undefined && /^http:\/\//i.test(url) && !isLocalUrl(url)) matches.push({ kind: "insecure-http", node: value ?? fallback, evidence: "Explicit HTTP endpoint uses an unencrypted transport." });
}

function addWebSocketUrl(matches: NetworkMatch[], value: TSESTree.Node | undefined, fallback: TSESTree.Node): void {
  const url = stringValue(value);
  if (url !== undefined && /^ws:\/\//i.test(url) && !isLocalUrl(url)) matches.push({ kind: "insecure-websocket", node: value ?? fallback, evidence: "Explicit WebSocket endpoint uses an unencrypted transport." });
}

function addTlsOptions(matches: NetworkMatch[], value: TSESTree.Node | undefined): void {
  if (value?.type !== "ObjectExpression") return;
  const rejectUnauthorized = objectValue(value, "rejectUnauthorized");
  if (rejectUnauthorized?.type === "Literal" && rejectUnauthorized.value === false) matches.push({ kind: "tls-verification-disabled", node: rejectUnauthorized, evidence: "TLS rejectUnauthorized is explicitly false." });
  const minVersion = stringValue(objectValue(value, "minVersion"));
  if (minVersion !== undefined && WEAK_TLS.has(minVersion.toLowerCase())) matches.push({ kind: "weak-tls", node: objectValue(value, "minVersion") ?? value, evidence: `TLS minimum version is ${minVersion}.` });
  const secureProtocol = stringValue(objectValue(value, "secureProtocol"));
  if (secureProtocol !== undefined && /(?:tlsv1|sslv[23])/i.test(secureProtocol)) matches.push({ kind: "weak-tls", node: objectValue(value, "secureProtocol") ?? value, evidence: `TLS secure protocol is ${secureProtocol}.` });
}

function addCorsOptions(matches: NetworkMatch[], value: TSESTree.Node | undefined): void {
  if (value?.type !== "ObjectExpression") return;
  const origin = stringValue(objectValue(value, "origin"));
  if (origin !== "*") return;
  matches.push({ kind: "permissive-cors", node: objectValue(value, "origin") ?? value, evidence: "CORS origin is explicitly configured as '*'." });
  if (objectValue(value, "credentials")?.type === "Literal" && objectValue(value, "credentials")?.value === true) matches.push({ kind: "credentials-wildcard-origin", node: value, evidence: "CORS enables credentials while allowing every origin." });
}

function addProxySetting(matches: NetworkMatch[], node: TSESTree.CallExpression): void {
  if (stringValue(argumentAt(node, 0)) !== "trust proxy") return;
  const value = argumentAt(node, 1);
  if (value?.type === "Literal" && (value.value === true || typeof value.value === "number")) matches.push({ kind: "untrusted-proxy", node: value, evidence: "Express trust proxy is enabled broadly by a boolean or hop count." });
}

function isHttpCall(name: string | undefined, path: readonly string[] | undefined, state: ModelState): boolean {
  if (name === "fetch" || state.httpCalls.has(name ?? "")) return true;
  return path !== undefined && path.length === 2 && state.httpNamespaces.has(path[0] ?? "") && TLS_METHODS.has(path[1] ?? "");
}

function isWebSocketCall(name: string | undefined, path: readonly string[] | undefined): boolean { return name === "WebSocket" || path?.join(".") === "globalThis.WebSocket"; }
function isTlsCall(name: string | undefined, path: readonly string[] | undefined, state: ModelState): boolean {
  if (state.tlsCalls.has(name ?? "")) return true;
  return path !== undefined && path.length === 2 && state.tlsNamespaces.has(path[0] ?? "") && TLS_METHODS.has(path[1] ?? "");
}
function isProxySetCall(name: string | undefined, path: readonly string[] | undefined, state: ModelState): boolean {
  return state.proxySetCalls.has(name ?? "") || (path?.length === 2 && state.expressApps.has(path[0] ?? "") && path[1] === "set");
}
function optionsArgument(node: TSESTree.CallExpression | TSESTree.NewExpression): TSESTree.Node | undefined { return node.arguments.find((argument) => argument.type === "ObjectExpression"); }
function argumentAt(node: TSESTree.CallExpression | TSESTree.NewExpression, index: number): TSESTree.Node | undefined { const argument = node.arguments[index]; return argument?.type === "SpreadElement" ? undefined : argument; }
function calleeName(node: TSESTree.Node): string | undefined { return node.type === "Identifier" ? node.name : undefined; }
function memberPath(node: TSESTree.Node): readonly string[] | undefined { if (node.type === "Identifier") return [node.name]; if (node.type !== "MemberExpression" || node.computed) return undefined; const base = memberPath(node.object); const property = propertyName(node.property); return base === undefined || property === undefined ? undefined : [...base, property]; }
function importedName(specifier: TSESTree.ImportClause["specifiers"][number]): string { return specifier.type === "ImportSpecifier" ? (specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)) : "default"; }
function propertyName(node: TSESTree.Node): string | undefined { return node.type === "Identifier" ? node.name : stringValue(node); }
function objectValue(node: TSESTree.ObjectExpression, name: string): TSESTree.Node | undefined { const property = node.properties.find((entry) => entry.type === "Property" && !entry.computed && propertyName(entry.key) === name); return property?.type === "Property" ? property.value : undefined; }
function stringValue(node: TSESTree.Node | undefined): string | undefined { if (node?.type === "Literal" && typeof node.value === "string") return node.value; if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined; return undefined; }
function isLocalUrl(url: string): boolean { return /^\w+:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::|\/|$)/i.test(url); }
function unique(matches: readonly NetworkMatch[]): readonly NetworkMatch[] { const seen = new Set<string>(); return matches.filter((match) => { const key = `${match.kind}:${match.node.range?.join("-") ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function meta(id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta { const standards: readonly SecurityStandardMapping[] = [{ standard: "cwe", id: cwe }]; return { id, title, description: `${title} is configured explicitly.`, category: "network", defaultSeverity: severity, defaultConfidence: "high", standards }; }
function createFinding(context: SecurityRuleContext, match: NetworkMatch): SecurityFinding { const metaForMatch = METAS[match.kind]; const location = locationOf(match.node, context.file); return { id: createSecurityFindingId({ ruleId: metaForMatch.id, path: context.file, range: location.range, sinkKind: "network-request" }), ruleId: metaForMatch.id, title: metaForMatch.title, message: metaForMatch.description, severity: metaForMatch.defaultSeverity, confidence: metaForMatch.defaultConfidence, category: "network", location, evidence: [{ message: match.evidence, location, sinkKind: "network-request" }], standards: metaForMatch.standards, sinkKind: "network-request", suggestion: "Use an explicit secure transport configuration appropriate for the deployment environment." }; }
function locationOf(node: TSESTree.Node, file: string): SecurityFinding["location"] { return { path: file, line: node.loc?.start.line, column: node.loc?.start.column, range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] } }; }
function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void { visitor(node); for (const value of Object.values(node)) { if (isNode(value)) visit(value, visitor); else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item, visitor); } }
function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"; }
