import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import { analyzeInterproceduralTaint, type TaintFlowMatch } from "../../flow";
import type { SecurityFinding, SecurityRule, SecurityRuleContext, SecurityRuleMeta } from "../../model/types";
import { createFilesystemFlowAdapter } from "./filesystem-model";

type RuleKind = "path-traversal" | "arbitrary-read" | "arbitrary-write" | "unsafe-upload" | "unrestricted-upload" | "zip-slip" | "insecure-temp-file" | "symlink-risk";

const DEFINITIONS: Readonly<Record<RuleKind, SecurityRuleMeta>> = {
  "path-traversal": meta("path-traversal", "Path traversal", "high", "CWE-22"),
  "arbitrary-read": meta("arbitrary-read", "Arbitrary file read", "high", "CWE-22"),
  "arbitrary-write": meta("arbitrary-write", "Arbitrary file write", "critical", "CWE-73"),
  "unsafe-upload": meta("unsafe-upload", "Unsafe file upload", "high", "CWE-434"),
  "unrestricted-upload": meta("unrestricted-upload", "Unrestricted file upload", "high", "CWE-434"),
  "zip-slip": meta("zip-slip", "Archive extraction path traversal", "high", "CWE-22"),
  "insecure-temp-file": meta("insecure-temp-file", "Insecure temporary file", "medium", "CWE-377"),
  "symlink-risk": meta("symlink-risk", "Symlink-following filesystem write", "high", "CWE-59"),
};

export const filesystemRules: readonly SecurityRule[] = (Object.keys(DEFINITIONS) as RuleKind[]).map((kind) => ({
  meta: DEFINITIONS[kind],
  check(context) {
    const findings = kind === "path-traversal" || kind === "arbitrary-read" || kind === "arbitrary-write"
      ? taintFindings(context, kind)
      : patternFindings(context, kind);
    return findings;
  },
}));

function meta(kind: RuleKind, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta {
  return { id: `security.filesystem.${kind}`, title, description: `${title} can expose resources outside the intended boundary.`, category: "filesystem", defaultSeverity: severity, defaultConfidence: "high", standards: [{ standard: "cwe", id: cwe }] };
}

function taintFindings(context: SecurityRuleContext, kind: "path-traversal" | "arbitrary-read" | "arbitrary-write"): readonly SecurityFinding[] {
  const contained = containedPathNames(context.ast);
  return analyzeInterproceduralTaint(context.ast, context.file, createFilesystemFlowAdapter())
    .filter((match) => isTaintMatch(match, kind) && !isContained(match, contained))
    .map((match) => finding(context, kind, match.sink.node, match.sink.label, match));
}

function isTaintMatch(match: TaintFlowMatch, kind: RuleKind): boolean {
  if (match.family !== "path") return false;
  if (kind === "path-traversal") return true;
  return kind === "arbitrary-read" ? match.sink.label.includes("read") : match.sink.label.includes("write");
}

function isContained(match: TaintFlowMatch, names: ReadonlySet<string>): boolean {
  return match.sink.value.type === "Identifier" && names.has(match.sink.value.name);
}

function patternFindings(context: SecurityRuleContext, kind: Exclude<RuleKind, "path-traversal" | "arbitrary-read" | "arbitrary-write">): readonly SecurityFinding[] {
  const matches: TSESTree.CallExpression[] = [];
  visit(context.ast, (node) => {
    if (node.type === "CallExpression" && matchesPattern(node, kind)) matches.push(node);
  });
  return matches.map((node) => finding(context, kind, node, DEFINITIONS[kind].title));
}

function matchesPattern(node: TSESTree.CallExpression, kind: RuleKind): boolean {
  const path = memberPath(node.callee)?.join(".") ?? "";
  const first = argument(node, 0);
  if (kind === "unsafe-upload") return isFilesystemWrite(path) && containsUploadName(first);
  if (kind === "unrestricted-upload") return /\.(any|fields)$/.test(path) || path.endsWith(".any");
  if (kind === "zip-slip") return /\.(extract|extractAll|unzip)$/.test(path) && isRequestValue(first);
  if (kind === "insecure-temp-file") return /\.(mktemp|mkdtemp)(Sync)?$/.test(path) && stringArgumentStartsWith(first, "/tmp/");
  if (kind === "symlink-risk") return isFilesystemWrite(path) && isRequestValue(first);
  return false;
}

function finding(context: SecurityRuleContext, kind: RuleKind, node: TSESTree.Node, label: string, match?: TaintFlowMatch): SecurityFinding {
  const location = locationOf(node, context.file);
  return {
    id: createSecurityFindingId({ ruleId: DEFINITIONS[kind].id, path: context.file, range: location.range, sinkKind: "filesystem-path" }),
    ruleId: DEFINITIONS[kind].id, title: DEFINITIONS[kind].title,
    message: `${DEFINITIONS[kind].title}: ${label}.`, severity: DEFINITIONS[kind].defaultSeverity, confidence: "high", category: "filesystem", location,
    evidence: [{ message: label, location, sinkKind: "filesystem-path" }], flow: match?.flow, standards: DEFINITIONS[kind].standards, sinkKind: "filesystem-path",
    suggestion: "Validate path input and enforce a canonical, allowlisted resource boundary before filesystem access.",
  };
}

function containedPathNames(ast: TSESTree.Program): ReadonlySet<string> {
  const resolved = new Set<string>(); const contained = new Set<string>();
  visit(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init?.type === "CallExpression" && lastMemberSegment(node.init.callee) === "resolve") resolved.add(node.id.name);
    if (node.type === "CallExpression" && lastMemberSegment(node.callee) === "startsWith" && node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && resolved.has(node.callee.object.name) && stringArgumentStartsWith(argument(node, 0), "/")) contained.add(node.callee.object.name);
  });
  return contained;
}

function isFilesystemWrite(path: string): boolean { return /\.(writeFile|writeFileSync|createWriteStream|rename|renameSync|copyFile|copyFileSync)$/.test(path); }
function containsUploadName(node: TSESTree.Node | undefined): boolean { return memberPath(node)?.includes("originalname") ?? false; }
function isRequestValue(node: TSESTree.Node | undefined): boolean { const path = memberPath(node); return path !== undefined && ["req", "request", "ctx"].includes(path[0] ?? ""); }
function stringArgumentStartsWith(node: TSESTree.Node | undefined, prefix: string): boolean { return node?.type === "Literal" && typeof node.value === "string" && node.value.startsWith(prefix); }
function argument(node: TSESTree.CallExpression, index: number): TSESTree.Node | undefined { const value = node.arguments[index]; return value === undefined || value.type === "SpreadElement" ? undefined : value; }
function locationOf(node: TSESTree.Node, path: string): SecurityFinding["location"] { return { path, line: node.loc?.start.line, column: node.loc?.start.column, range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] } }; }
function lastMemberSegment(node: TSESTree.Node | undefined): string | undefined { const path = memberPath(node); return path === undefined || path.length === 0 ? undefined : path[path.length - 1]; }
function memberPath(node: TSESTree.Node | undefined): readonly string[] | undefined { if (node === undefined) return undefined; if (node.type === "Identifier") return [node.name]; if (node.type !== "MemberExpression") return undefined; const object = memberPath(node.object); const property = !node.computed && node.property.type === "Identifier" ? node.property.name : node.property.type === "Literal" && typeof node.property.value === "string" ? node.property.value : undefined; return object === undefined || property === undefined ? undefined : [...object, property]; }
function visit(node: TSESTree.Node, callback: (node: TSESTree.Node) => void): void {
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) visit(child, callback);
      }
    } else if (isNode(value)) {
      visit(value, callback);
    }
  }
}
function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof (value as { type?: unknown }).type === "string"; }
