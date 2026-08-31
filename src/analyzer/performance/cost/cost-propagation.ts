import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceCostKind, PerformanceCostSummary, PerformanceLocation, PerformanceOperation, PerformancePathStep, PerformanceRuleContext } from "../model/types";

function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"; }
function visit(node: TSESTree.Node, callback: (node: TSESTree.Node, ancestors: readonly TSESTree.Node[]) => void, ancestors: readonly TSESTree.Node[] = []): void { callback(node, ancestors); for (const value of Object.values(node)) { if (isNode(value)) visit(value, callback, [...ancestors, node]); else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item, callback, [...ancestors, node]); } }
function pathOf(node: TSESTree.Node): string | undefined { if (node.type === "Identifier") return node.name; if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined; const object = pathOf(node.object); return object === undefined ? undefined : `${object}.${node.property.name}`; }
function isLoop(node: TSESTree.Node): boolean { return node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement" || node.type === "WhileStatement" || node.type === "DoWhileStatement"; }
function locationOf(context: PerformanceRuleContext, node: TSESTree.Node): PerformanceLocation { const range = node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] }; return { path: context.file, line: node.loc?.start.line, column: node.loc?.start.column, range }; }
function operationKinds(path: string, context: PerformanceRuleContext): readonly PerformanceCostKind[] { if (path === "fetch" || path.startsWith("axios.") || path === "http.request" || path === "https.request") return ["network", "external-service"]; if ((context.databaseAdapters ?? []).some((adapter) => adapter.callPaths.includes(path))) return ["database"]; if (path.startsWith("fs.") || path.startsWith("node:fs.")) return ["filesystem"]; if (path === "JSON.stringify" || path === "JSON.parse") return ["serialization"]; if (path.endsWith(".sort") || path === "sort") return ["cpu-heavy"]; return []; }
function propagationLabels(ancestors: readonly TSESTree.Node[]): readonly string[] { const labels: string[] = []; for (const ancestor of ancestors) { if (isLoop(ancestor) && !labels.includes("repeated in loop")) labels.push("repeated in loop"); if (ancestor.type === "ReturnStatement" && !labels.includes("returned from local scope")) labels.push("returned from local scope"); if (ancestor.type === "VariableDeclarator" && ancestor.id.type === "Identifier") labels.push(`assigned to ${ancestor.id.name}`); if (ancestor.type === "ConditionalExpression" || ancestor.type === "IfStatement") if (!labels.includes("conditional path")) labels.push("conditional path"); } return labels; }
function operationKey(operation: PerformanceOperation): string { const start = operation.location.range?.start ?? -1; return `${operation.location.path}:${start}:${operation.kind}:${(operation.kinds ?? []).join(",")}`; }

export function analyzePerformanceCosts(context: PerformanceRuleContext): PerformanceCostSummary {
  const operations: PerformanceOperation[] = [...(context.operations ?? [])];
  const paths: PerformancePathStep[] = [];
  visit(context.ast, (node, ancestors) => {
    if (node.type !== "CallExpression") return;
    const callPath = pathOf(node.callee);
    if (callPath === undefined) return;
    const kinds = operationKinds(callPath, context);
    if (kinds.length === 0) return;
    const operation: PerformanceOperation = { kind: kinds[0], kinds, location: locationOf(context, node), repeated: ancestors.some(isLoop), blocking: callPath.endsWith("Sync"), external: kinds.includes("external-service") };
    operations.push(operation);
    paths.push({ label: `operation ${callPath}`, operation, location: operation.location });
    for (const label of propagationLabels(ancestors)) paths.push({ label, operation, location: operation.location });
  });
  const uniqueOperations = [...new Map(operations.map((operation) => [operationKey(operation), operation])).values()].sort((left, right) => (left.location.range?.start ?? -1) - (right.location.range?.start ?? -1) || left.kind.localeCompare(right.kind));
  const sortedPaths = [...paths].sort((left, right) => (left.location?.range?.start ?? -1) - (right.location?.range?.start ?? -1) || left.label.localeCompare(right.label));
  return { operations: uniqueOperations, paths: sortedPaths };
}
