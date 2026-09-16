import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { parseSource } from "../ast/parser";
import { buildRepositoryContext } from "../repository-context";
import type { RepositoryContext } from "../repository-context";
import { bindingNames, boundedNodes, conditionallyExecuted, isFunction } from "./ast";
import type { NodeEntry } from "./ast";
import type { SemanticCacheSummary, SemanticDiagnostic, SemanticFunctionSummary, SemanticOptions, SemanticProgram, SemanticSourceFile } from "./contracts";
import { collectSymbols, resolveSymbol } from "./symbols";
import type { SemanticSymbol } from "./symbols";

const DEFAULTS = { maxFiles: 1_000, maxSourceCharacters: 2_000_000, maxNodes: 200_000, maxDepth: 64, maxSymbols: 256 };

function limit(value: number | undefined, maximum: number): number {
  return value === undefined ? maximum : Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
}

export function analyzeSemanticProgram(files: readonly SemanticSourceFile[], options: SemanticOptions = {}): SemanticProgram {
  const budgets = {
    maxFiles: limit(options.maxFiles, DEFAULTS.maxFiles),
    maxSourceCharacters: limit(options.maxSourceCharacters, DEFAULTS.maxSourceCharacters),
    maxNodes: limit(options.maxNodes, DEFAULTS.maxNodes),
    maxDepth: limit(options.maxDepth, DEFAULTS.maxDepth),
    maxSymbols: limit(options.maxSymbols, DEFAULTS.maxSymbols),
  };
  const diagnostics: SemanticDiagnostic[] = [];
  const accepted: SemanticSourceFile[] = [];
  let characters = 0;
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const path = file.path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (accepted.length >= budgets.maxFiles || characters + file.content.length > budgets.maxSourceCharacters
      || accepted.some((item) => item.path === path) || path.split("/").includes("..") || path.startsWith("/")) {
      diagnostics.push({ file: path, code: "input-limit" }); continue;
    }
    accepted.push({ ...file, path });
    characters += file.content.length;
  }
  const programs = new Map<string, TSESTree.Program>();
  const entries = new Map<string, readonly NodeEntry[]>();
  let nodes = 0;
  for (const file of accepted) {
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file.path)) continue;
    try {
      const program = parseSource(file.content);
      const traversal = boundedNodes(program, file.path, budgets.maxNodes - nodes, budgets.maxDepth);
      nodes += traversal.entries.length;
      diagnostics.push(...traversal.diagnostics);
      // Never summarize a partial AST as if its missing observations were absent.
      if (traversal.diagnostics.length === 0) { programs.set(file.path, program); entries.set(file.path, traversal.entries); }
    } catch { diagnostics.push({ file: file.path, code: "parse-error" }); }
  }
  // Context is built from admitted, completely traversed source and bounded config files only.
  const context = buildRepositoryContext(accepted.filter((file) => !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file.path) || programs.has(file.path)));
  for (const item of context.imports) if (item.resolvedPath === undefined && item.specifier.startsWith(".")) diagnostics.push({ file: item.from, code: "unresolved-import" });
  for (const item of context.exports) if (item.resolvedPath === undefined && item.sourceSpecifier?.startsWith(".")) diagnostics.push({ file: item.from, code: "unresolved-import" });
  const allSymbols = [...programs].flatMap(([file, program]) => collectSymbols(file, program));
  const symbols = new Map(allSymbols.slice(0, budgets.maxSymbols).map((symbol) => [symbol.id, symbol] as const));
  if (allSymbols.length > budgets.maxSymbols) diagnostics.push({ file: "", code: "input-limit" });
  const functions = [...symbols.values()].filter((item) => item.kind === "function")
    .map((symbol) => summarizeFunction(symbol, entries.get(symbol.file) ?? [], symbols, context, budgets.maxDepth));
  for (const summary of functions) if (hasCycle(summary.id, functions, budgets.maxDepth)) diagnostics.push({ file: summary.file, code: "recursive-call" });
  const caches = [...symbols.values()].filter((item) => item.kind === "cache")
    .map((symbol) => summarizeCache(symbol, entries, symbols, context, budgets.maxDepth));
  return {
    schemaVersion: 1,
    complete: !diagnostics.some((item) => ["input-limit", "node-limit", "depth-limit", "parse-error", "unresolved-import"].includes(item.code)),
    functions, caches,
    diagnostics: [...new Map(diagnostics.map((item) => [`${item.file}:${item.code}`, item])).values()].sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code)),
    capabilities: { wholeProgramTaint: false, lifecycleProof: false, hardResourceIsolation: false },
  };
}

function localBindings(node: TSESTree.Node, entries: readonly NodeEntry[]): ReadonlySet<string> {
  if (!isFunction(node)) return new Set();
  const names = new Set(node.params.flatMap(bindingNames));
  for (const entry of entries.filter((item) => item.ancestors.includes(node))) {
    if (entry.node.type === "VariableDeclarator") bindingNames(entry.node.id).forEach((name) => names.add(name));
    if ((entry.node.type === "FunctionDeclaration" || entry.node.type === "ClassDeclaration") && entry.node.id !== null) names.add(entry.node.id.name);
    if (entry.node.type === "CatchClause" && entry.node.param !== null) bindingNames(entry.node.param).forEach((name) => names.add(name));
  }
  // Conservatively includes block/nested bindings: missed resolutions stay unknown.
  return names;
}

function functionEntries(node: TSESTree.Node, entries: readonly NodeEntry[]): readonly NodeEntry[] {
  return entries.filter((entry) => entry.ancestors.includes(node)
    && !entry.ancestors.some((ancestor) => ancestor !== node && isFunction(ancestor)));
}

function summarizeFunction(symbol: SemanticSymbol, entries: readonly NodeEntry[], symbols: ReadonlyMap<string, SemanticSymbol>, context: RepositoryContext, depth: number): SemanticFunctionSummary {
  const shadows = localBindings(symbol.node, entries);
  const body = functionEntries(symbol.node, entries);
  const calls = new Set<string>();
  let unknownCallCount = 0;
  for (const { node } of body) {
    if (node.type !== "CallExpression") continue;
    const target = node.callee.type === "Identifier" && !shadows.has(node.callee.name)
      ? resolveSymbol(symbol.file, node.callee.name, symbols, context, depth) : undefined;
    if (target?.kind === "function") calls.add(target.id);
    else unknownCallCount++;
  }
  return {
    id: symbol.id, file: symbol.file, name: symbol.name, calls: [...calls].sort(), unknownCallCount,
    definitions: [...shadows].sort(),
    // Syntactic identifier use sets, not reaching-definition or taint claims.
    uses: [...new Set(body.filter((entry) => entry.node.type === "Identifier").flatMap((entry) => entry.node.type === "Identifier" ? [entry.node.name] : []))].sort(),
  };
}

function summarizeCache(symbol: SemanticSymbol, repositoryEntries: ReadonlyMap<string, readonly NodeEntry[]>, symbols: ReadonlyMap<string, SemanticSymbol>, context: RepositoryContext, depth: number): SemanticCacheSummary {
  let cleanup: SemanticCacheSummary["cleanup"] = "not-observed";
  let sizeGuardObserved = false;
  let writes = 0;
  const observedBindings = new Map<TSESTree.Node, ReadonlySet<string>>();
  for (const [file, entries] of repositoryEntries) for (const { node, ancestors } of entries) {
    if (node.type !== "MemberExpression" || node.computed || node.object.type !== "Identifier" || node.property.type !== "Identifier") continue;
    const enclosingFunctions = ancestors.filter(isFunction);
    if (enclosingFunctions.some((enclosing) => {
      const shadows = observedBindings.get(enclosing) ?? localBindings(enclosing, entries);
      observedBindings.set(enclosing, shadows);
      return node.object.type === "Identifier" && shadows.has(node.object.name);
    })) continue;
    if (resolveSymbol(file, node.object.name, symbols, context, depth)?.id !== symbol.id) continue;
    const parent = ancestors[ancestors.length - 1];
    if (node.property.name === "size" && numericGuard(node, ancestors)) sizeGuardObserved = true;
    if (parent?.type !== "CallExpression" || parent.callee !== node) continue;
    if (node.property.name === "set") writes++;
    if (["clear", "delete"].includes(node.property.name)) {
      const conditional = conditionallyExecuted(ancestors) || ancestors.filter(isFunction).length > 1;
      if (conditional) cleanup = "unknown";
      else if (cleanup !== "unknown") cleanup = "observed-unconditional";
    }
  }
  return { id: symbol.id, file: symbol.file, name: symbol.name, retention: symbol.retention ?? "unknown", cleanup, sizeGuardObserved, writes };
}

function numericGuard(node: TSESTree.MemberExpression, ancestors: readonly TSESTree.Node[]): boolean {
  const binary = ancestors[ancestors.length - 1];
  if (binary?.type !== "BinaryExpression") return false;
  const other = binary.left === node ? binary.right : binary.left;
  const numeric = other.type === "Literal" && typeof other.value === "number" && Number.isFinite(other.value) && other.value >= 0;
  const ordered = binary.left === node ? [">", ">="].includes(binary.operator) : ["<", "<="].includes(binary.operator);
  return numeric && ordered && ancestors.some((entry) => (entry.type === "IfStatement" || entry.type === "ConditionalExpression") && (entry.test === binary || ancestors.includes(entry.test)));
}

function hasCycle(id: string, functions: readonly SemanticFunctionSummary[], maxDepth: number): boolean {
  const pending = [{ id, depth: 0 }];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined || visited.has(entry.id) || entry.depth >= maxDepth) continue;
    visited.add(entry.id);
    const calls = functions.find((item) => item.id === entry.id)?.calls ?? [];
    if (calls.includes(id)) return true;
    pending.push(...calls.map((call) => ({ id: call, depth: entry.depth + 1 })));
  }
  return false;
}
