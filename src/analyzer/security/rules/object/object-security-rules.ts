import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import { analyzeInterproceduralTaint, type TaintFlowAdapter } from "../../flow";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../../model/types";

type RuleKind =
  | "prototype-pollution"
  | "unsafe-deep-merge"
  | "untrusted-dynamic-key"
  | "constructor-prototype"
  | "unsafe-object-assign";

interface Match {
  readonly kind: RuleKind;
  readonly node: TSESTree.Node;
  readonly evidence: string;
}

const METAS: Readonly<Record<RuleKind, SecurityRuleMeta>> = {
  "prototype-pollution": meta("security.object.prototype-pollution", "Prototype pollution", "critical", "CWE-1321"),
  "unsafe-deep-merge": meta("security.object.unsafe-deep-merge", "Unsafe deep merge", "high", "CWE-1321"),
  "untrusted-dynamic-key": meta("security.object.untrusted-dynamic-key", "Untrusted dynamic object key", "high", "CWE-915"),
  "constructor-prototype": meta("security.object.constructor-prototype", "Constructor prototype mutation", "critical", "CWE-1321"),
  "unsafe-object-assign": meta("security.object.unsafe-object-assign", "Unsafe Object.assign", "high", "CWE-1321"),
};

export const objectSecurityRules: readonly SecurityRule[] = (Object.keys(METAS) as RuleKind[]).map((kind) => ({
  meta: METAS[kind],
  check(context) {
    return findMatches(context)
      .filter((match) => match.kind === kind)
      .map((match) => createFinding(context, match));
  },
}));

function meta(id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta {
  return {
    id, title, category: "object", defaultSeverity: severity, defaultConfidence: "high",
    description: `${title} is detected from a known JavaScript object mutation pattern.`,
    standards: [{ standard: "cwe", id: cwe }],
  };
}

function findMatches(context: SecurityRuleContext): readonly Match[] {
  const matches: Match[] = [];
  const objectAssignAliases = collectObjectAssignAliases(context.ast);
  visit(context.ast, (node) => {
    if (node.type === "AssignmentExpression") inspectAssignment(node, matches);
    if (node.type === "CallExpression") inspectCall(node, objectAssignAliases, matches);
  });

  const adapter = createObjectFlowAdapter(context.ast, objectAssignAliases);
  for (const flow of analyzeInterproceduralTaint(context.ast, context.file, adapter)) {
    const kind: RuleKind = flow.sink.label === "Unsafe Object.assign source"
      ? "unsafe-object-assign"
      : flow.sink.label === "Unsafe deep merge source"
        ? "unsafe-deep-merge"
        : "untrusted-dynamic-key";
    matches.push({
      kind, node: flow.sink.node,
      evidence: kind === "untrusted-dynamic-key"
        ? "A request-controlled value is used as a computed object property key."
        : "A request-controlled object reaches a known unsafe object merge API.",
    });
  }
  return unique(matches);
}

function inspectAssignment(node: TSESTree.AssignmentExpression, matches: Match[]): void {
  const path = memberPath(node.left);
  if (path?.includes("__proto__")) {
    matches.push({ kind: "prototype-pollution", node, evidence: "Object mutation writes to the __proto__ path." });
  }
  if (hasConstructorPrototype(path)) {
    matches.push({ kind: "constructor-prototype", node, evidence: "Object mutation writes through constructor.prototype." });
  }
}

function inspectCall(node: TSESTree.CallExpression, objectAssignAliases: ReadonlySet<string>, matches: Match[]): void {
  const name = calleeName(node.callee);
  const source = expressionArgument(node, 1);
  if (source === undefined || !isRequestControlled(source)) return;
  if (name === "Object.assign" || (node.callee.type === "Identifier" && objectAssignAliases.has(node.callee.name))) {
    matches.push({ kind: "unsafe-object-assign", node, evidence: "Object.assign copies a request-controlled object into a target." });
  }
  if (name !== undefined && ["merge", "deepmerge", "lodash.merge", "_.merge"].includes(name)) {
    matches.push({ kind: "unsafe-deep-merge", node, evidence: "Known recursive merge API receives a request-controlled object." });
  }
}

function createObjectFlowAdapter(ast: TSESTree.Program, objectAssignAliases: ReadonlySet<string>): TaintFlowAdapter {
  const guardedAssignments = collectGuardedAssignments(ast);
  return {
    matchSource: (node) => isRequestControlled(node) ? {
      node, label: "Request-controlled object key", sourceKind: "request-input", kinds: ["user-input"],
    } : undefined,
    matchSanitizer: () => undefined,
    matchSinks: (node) => {
      if (node.type === "AssignmentExpression" && isTaintedComputedWrite(node, guardedAssignments)) {
        return [{ family: "user-input", node, value: node.left.property, label: "Computed object property write", sinkKind: "unknown" }];
      }
      if (node.type !== "CallExpression") return [];
      const source = expressionArgument(node, 1);
      if (source === undefined) return [];
      const name = calleeName(node.callee);
      if (name === "Object.assign" || (node.callee.type === "Identifier" && objectAssignAliases.has(node.callee.name))) {
        return [{ family: "user-input", node, value: source, label: "Unsafe Object.assign source", sinkKind: "unknown" }];
      }
      if (name !== undefined && ["merge", "deepmerge", "lodash.merge", "_.merge"].includes(name)) {
        return [{ family: "user-input", node, value: source, label: "Unsafe deep merge source", sinkKind: "unknown" }];
      }
      return [];
    },
  };
}

function isTaintedComputedWrite(node: TSESTree.AssignmentExpression, guardedAssignments: ReadonlySet<number>): node is TSESTree.AssignmentExpression & { readonly left: TSESTree.MemberExpression } {
  return node.left.type === "MemberExpression" && node.left.computed && node.left.property.type !== "Literal" && !guardedAssignments.has(node.range?.[0] ?? -1);
}

function collectGuardedAssignments(ast: TSESTree.Program): ReadonlySet<number> {
  const guarded = new Set<number>();
  visit(ast, (node) => {
    if (node.type !== "IfStatement" || !isAllowlistGuard(node.test)) return;
    visit(node.consequent, (child) => {
      if (child.type === "AssignmentExpression" && child.range !== undefined) guarded.add(child.range[0]);
    });
  });
  return guarded;
}

function isAllowlistGuard(node: TSESTree.Node): boolean {
  return node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed &&
    node.callee.property.type === "Identifier" && node.callee.property.name === "includes" &&
    node.callee.object.type === "ArrayExpression" && node.callee.object.elements.every((element) => element?.type === "Literal" && typeof element.value === "string");
}

function collectObjectAssignAliases(ast: TSESTree.Program): ReadonlySet<string> {
  const aliases = new Set<string>();
  visit(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init !== null && calleeName(node.init) === "Object.assign") aliases.add(node.id.name);
  });
  return aliases;
}

function isRequestControlled(node: TSESTree.Node): boolean {
  const path = memberPath(node);
  return path !== undefined && ["req", "request", "ctx", "event"].includes(path[0] ?? "") &&
    path.some((segment) => ["query", "body", "params", "headers", "cookies"].includes(segment));
}

function memberPath(node: TSESTree.Node): readonly string[] | undefined {
  if (node.type === "Identifier") return [node.name];
  if (node.type !== "MemberExpression") return undefined;
  const object = memberPath(node.object);
  const property = node.computed ? literalName(node.property) : node.property.type === "Identifier" ? node.property.name : undefined;
  return object === undefined || property === undefined ? undefined : [...object, property];
}
function calleeName(node: TSESTree.Node): string | undefined { const path = memberPath(node); return path?.join("."); }
function literalName(node: TSESTree.Node): string | undefined { return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined; }
function hasConstructorPrototype(path: readonly string[] | undefined): boolean { return path?.some((part, index) => part === "constructor" && path[index + 1] === "prototype") ?? false; }
function expressionArgument(node: TSESTree.CallExpression, index: number): TSESTree.Expression | undefined { const argument = node.arguments[index]; return argument === undefined || argument.type === "SpreadElement" ? undefined : argument; }

function createFinding(context: SecurityRuleContext, match: Match): SecurityFinding {
  const metaForMatch = METAS[match.kind]; const location = locationOf(match.node, context.file);
  return { id: createSecurityFindingId({ ruleId: metaForMatch.id, path: context.file, range: location.range }), ruleId: metaForMatch.id,
    title: metaForMatch.title, message: metaForMatch.description, severity: metaForMatch.defaultSeverity, confidence: metaForMatch.defaultConfidence,
    category: "object", location, evidence: [{ message: match.evidence, location }], standards: metaForMatch.standards,
    suggestion: "Reject prototype keys and use an allowlist before mutating objects with untrusted data.", };
}
function locationOf(node: TSESTree.Node, file: string): SecurityFinding["location"] { return { path: file, line: node.loc?.start.line, column: node.loc?.start.column, range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] } }; }
function unique(matches: readonly Match[]): readonly Match[] { const seen = new Set<string>(); return matches.filter((match) => { const key = `${match.kind}:${match.node.range?.join("-") ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void { visitor(node); for (const value of Object.values(node)) { if (isNode(value)) visit(value, visitor); else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item, visitor); } }
function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"; }
