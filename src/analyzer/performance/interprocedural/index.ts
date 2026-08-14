import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceCostKind, PerformanceFunctionSummary, PerformanceInterproceduralResult, PerformanceRuleContext } from "../model/types";
import { callPath, visit } from "../rules/ast-utils";

const MAX_DEPTH = 8;
export function analyzeInterproceduralPerformance(context: PerformanceRuleContext): PerformanceInterproceduralResult {
  const functions = collectFunctions(context.ast); const direct = new Map<string, readonly PerformanceCostKind[]>(); const calls = new Map<string, readonly string[]>();
  for (const [name, node] of functions) { const details = inspectFunction(node, context); direct.set(name, details.costs); calls.set(name, details.calls); }
  const summaries: PerformanceFunctionSummary[] = [...functions.keys()].sort().map((name) => summarize(name, direct, calls, functions));
  return { summaries, callGraph: new Map([...calls.entries()].sort(([left], [right]) => left.localeCompare(right))) };
}
function collectFunctions(ast: TSESTree.Program): ReadonlyMap<string, TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression> { const result = new Map<string, TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression>(); visit(ast, (node) => { if (node.type === "FunctionDeclaration" && node.id) result.set(node.id.name, node); if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init && (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")) result.set(node.id.name, node.init); }); return result; }
function inspectFunction(node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression, context: PerformanceRuleContext): { readonly costs: readonly PerformanceCostKind[]; readonly calls: readonly string[] } { const costs = new Set<PerformanceCostKind>(); const calls = new Set<string>(); visit(node.body, (child) => { if (child.type !== "CallExpression") return; const path = callPath(child); if (!path) return; const kinds = costKinds(path, context); if (kinds.length > 0) kinds.forEach((kind) => costs.add(kind)); else calls.add(path); }); return { costs: [...costs].sort(), calls: [...calls].sort() }; }
function costKinds(path: string, context: PerformanceRuleContext): readonly PerformanceCostKind[] { if (path === "fetch" || path.startsWith("axios.")) return ["network", "external-service"]; if (path === "JSON.stringify" || path === "JSON.parse") return ["serialization"]; if ((context.databaseAdapters ?? []).some((adapter) => adapter.callPaths.includes(path))) return ["database"]; return []; }
function summarize(name: string, direct: ReadonlyMap<string, readonly PerformanceCostKind[]>, calls: ReadonlyMap<string, readonly string[]>, functions: ReadonlyMap<string, unknown>): PerformanceFunctionSummary { const costs = new Set(direct.get(name)); const unknown = new Set<string>(); const visited = new Set<string>([name]); const walk = (current: string, depth: number): void => { if (depth >= MAX_DEPTH) return; for (const call of calls.get(current) ?? []) { if (!functions.has(call)) { unknown.add(call); continue; } if (visited.has(call)) continue; visited.add(call); (direct.get(call) ?? []).forEach((kind) => costs.add(kind)); walk(call, depth + 1); } }; walk(name, 0); return { name, directCostKinds: direct.get(name) ?? [], costKinds: [...costs].sort(), calls: calls.get(name) ?? [], unknownCalls: [...unknown].sort() }; }

export {
  analyzeInterproceduralPerformanceFiles,
  createInterproceduralContext,
  type PerformanceInterproceduralFile,
  type PerformanceInterproceduralOptions,
} from "./repository";
