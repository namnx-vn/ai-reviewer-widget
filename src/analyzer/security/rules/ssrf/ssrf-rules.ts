import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import {
  analyzeInterproceduralTaint,
  type TaintFlowAdapter,
  type TaintFlowMatch,
  type TaintSanitizer,
  type TaintSink,
  type TaintSource,
} from "../../flow";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../../model/types";

type SsrfKind = "untrusted-request" | "metadata-endpoint" | "local-network" | "localhost" | "unsafe-redirect" | "weak-host-validation";

interface Match {
  readonly kind: SsrfKind;
  readonly node: TSESTree.Node;
  readonly label: string;
}

const METAS: Readonly<Record<SsrfKind, SecurityRuleMeta>> = {
  "untrusted-request": meta("security.ssrf.untrusted-request", "Untrusted server-side request", "high", "CWE-918"),
  "metadata-endpoint": meta("security.ssrf.metadata-endpoint", "Cloud metadata endpoint request", "critical", "CWE-918"),
  "local-network": meta("security.ssrf.local-network", "Private network request", "high", "CWE-918"),
  localhost: meta("security.ssrf.localhost", "Loopback request", "high", "CWE-918"),
  "unsafe-redirect": meta("security.ssrf.unsafe-redirect", "Unsafe server-side redirect handling", "medium", "CWE-601"),
  "weak-host-validation": meta("security.ssrf.weak-host-validation", "Weak SSRF hostname validation", "high", "CWE-20"),
};

/** Server-side request analysis uses only explicit, statically modeled adapters. */
export const ssrfRules: readonly SecurityRule[] = (Object.keys(METAS) as SsrfKind[]).map((kind) => ({
  meta: METAS[kind],
  check(context) {
    const matches = kind === "untrusted-request"
      ? analyzeInterproceduralTaint(context.ast, context.file, createAdapter(context.ast))
          .filter((match) => match.family === "url")
          .map((match) => flowMatch(match))
      : collectStructuralMatches(context.ast).filter((match) => match.kind === kind);
    return matches.map((match) => createFinding(context, kind, match));
  },
}));

function meta(id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta {
  return { id, title, description: `${title} can expose internal services to attacker-controlled requests.`, category: "ssrf", defaultSeverity: severity, defaultConfidence: "high", standards: [{ standard: "cwe", id: cwe }] };
}

function createAdapter(ast: TSESTree.Program): TaintFlowAdapter {
  const calls = knownRequestCalls(ast);
  return {
    matchSource(node): TaintSource | undefined {
      if (!isRequestInput(node)) return undefined;
      return { node, label: "Request-controlled URL input", sourceKind: "request-input", kinds: ["url"] };
    },
    matchSanitizer(node): TaintSanitizer | undefined {
      if (node.callee.type !== "Identifier" || !new Set(["assertAllowedUrl", "validateAllowedUrl", "allowlistedUrl"]).has(node.callee.name)) return undefined;
      return { node, label: "URL protocol and hostname allowlist", sanitizerKind: "url-allowlist", clears: ["url"], argumentIndex: 0 };
    },
    matchSinks(node): readonly TaintSink[] {
      if (node.type !== "CallExpression" || !calls.has(calleeName(node.callee))) return [];
      const value = requestUrlArgument(node);
      return value === undefined ? [] : [{ family: "url", node, value, label: "Server-side request sink", sinkKind: "network-request" }];
    },
  };
}

function flowMatch(match: TaintFlowMatch): Match { return { kind: "untrusted-request", node: match.sink.node, label: match.sink.label }; }

function collectStructuralMatches(ast: TSESTree.Program): readonly Match[] {
  const calls = knownRequestCalls(ast);
  const matches: Match[] = [];
  visit(ast, (node) => {
    if (node.type === "CallExpression" && calls.has(calleeName(node.callee))) {
      const url = requestUrlArgument(node);
      const value = staticString(url);
      if (value !== undefined) addStaticUrlMatches(matches, node, value);
      if (hasUnsafeRedirect(node)) matches.push({ kind: "unsafe-redirect", node, label: "Request follows redirects" });
    }
    if (node.type === "IfStatement" && hasWeakHostCheck(node.test) && containsRequest(node.consequent, calls)) {
      matches.push({ kind: "weak-host-validation", node, label: "Substring hostname validation before request" });
    }
  });
  return unique(matches);
}

function addStaticUrlMatches(matches: Match[], node: TSESTree.Node, value: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { return; }
  const host = parsed.hostname.toLowerCase();
  if (host === "169.254.169.254" || host === "metadata.google.internal" || host === "metadata.aws.internal") matches.push({ kind: "metadata-endpoint", node, label: "Cloud metadata service target" });
  if (host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host)) matches.push({ kind: "localhost", node, label: "Loopback network target" });
  if (isPrivateIpv4(host) && !/^127(?:\.\d{1,3}){3}$/.test(host) && host !== "169.254.169.254") matches.push({ kind: "local-network", node, label: "Private network target" });
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254);
}

function knownRequestCalls(ast: TSESTree.Program): ReadonlySet<string> {
  const calls = new Set(["fetch", "axios.get", "axios.post", "axios.put", "axios.delete", "axios.request", "http.request", "https.request", "http.get", "https.get"]);
  visit(ast, (node) => {
    if (node.type !== "ImportDeclaration") return;
    const module = staticString(node.source);
    if (module !== "axios" && module !== "http" && module !== "https" && module !== "node:http" && module !== "node:https") return;
    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") calls.add(specifier.local.name);
      else {
        const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
        if (new Set(["get", "post", "put", "delete", "request"]).has(imported)) calls.add(specifier.local.name);
      }
    }
  });
  return calls;
}

function requestUrlArgument(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const argument = node.arguments[0];
  return argument === undefined || argument.type === "SpreadElement" ? undefined : argument;
}

function hasUnsafeRedirect(node: TSESTree.CallExpression): boolean {
  const options = node.arguments[1];
  if (options === undefined || options.type !== "ObjectExpression") return false;
  for (const property of options.properties) {
    if (property.type !== "Property" || property.key.type !== "Identifier") continue;
    if (property.key.name === "redirect" && staticString(property.value) === "follow") return true;
    if (property.key.name === "maxRedirects" && property.value.type === "Literal" && typeof property.value.value === "number" && property.value.value > 0) return true;
  }
  return false;
}

function hasWeakHostCheck(node: TSESTree.Node): boolean {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier") return false;
  return new Set(["includes", "startsWith", "endsWith", "match", "test"]).has(node.callee.property.name) && node.arguments.some((argument) => staticString(argument.type === "SpreadElement" ? undefined : argument) !== undefined);
}

function containsRequest(node: TSESTree.Node, calls: ReadonlySet<string>): boolean {
  let found = false;
  visit(node, (child) => { if (child.type === "CallExpression" && calls.has(calleeName(child.callee))) found = true; });
  return found;
}

function isRequestInput(node: TSESTree.Node): boolean {
  if (node.type !== "MemberExpression") return false;
  let root: TSESTree.Node = node.object;
  while (root.type === "MemberExpression") root = root.object;
  return root.type === "Identifier" && new Set(["req", "request", "ctx", "input"]).has(root.name);
}

function calleeName(node: TSESTree.Expression | TSESTree.Super): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && node.property.type === "Identifier") return `${calleeName(node.object)}.${node.property.name}`;
  return "";
}

function staticString(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function unique(matches: readonly Match[]): readonly Match[] {
  return matches.filter((match, index) => matches.findIndex((candidate) => candidate.kind === match.kind && candidate.node.range?.[0] === match.node.range?.[0]) === index);
}

function createFinding(context: SecurityRuleContext, kind: SsrfKind, match: Match): SecurityFinding {
  const location = { path: context.file, line: match.node.loc?.start.line, column: match.node.loc?.start.column, range: match.node.range === undefined ? undefined : { start: match.node.range[0], end: match.node.range[1] } };
  const meta = METAS[kind];
  return { id: createSecurityFindingId({ ruleId: meta.id, path: context.file, range: location.range, sinkKind: "network-request" }), ruleId: meta.id, title: meta.title, message: `${meta.title}: ${match.label}.`, severity: meta.defaultSeverity, confidence: meta.defaultConfidence, category: "ssrf", location, evidence: [{ message: match.label, location, sinkKind: "network-request" }], standards: meta.standards, sinkKind: "network-request", suggestion: "Allowlist protocols and resolved hostnames, block private address ranges, and disable or revalidate redirects." };
}

function visit(node: TSESTree.Node, callback: (node: TSESTree.Node) => void): void {
  callback(node);
  for (const value of Object.values(node)) {
    if (value === null || typeof value !== "object" || value === node.parent) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) visit(child, callback);
      }
    } else if (isNode(value)) {
      visit(value, callback);
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"; }
