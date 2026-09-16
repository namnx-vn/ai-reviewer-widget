import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { RepositoryContext } from "../repository-context";
import { bindingNames, isFunction } from "./ast";

export interface SemanticSymbol {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly kind: "function" | "cache" | "alias" | "unknown";
  readonly node: TSESTree.Node;
  readonly alias?: string;
  readonly retention?: "weak-key" | "strong-key";
}

export function collectSymbols(file: string, program: TSESTree.Program): readonly SemanticSymbol[] {
  const declarations = program.body.flatMap<TSESTree.Node>((statement) => {
    if (statement.type === "ExportNamedDeclaration") return statement.declaration === null ? [] : [statement.declaration];
    if (statement.type === "ExportDefaultDeclaration") return [statement.declaration];
    return [statement];
  });
  const declared = new Set(program.body.flatMap((statement) => statement.type === "ImportDeclaration" ? statement.specifiers.map((item) => item.local.name) : []));
  for (const node of declarations) {
    if (node.type === "VariableDeclaration") node.declarations.flatMap((item) => bindingNames(item.id)).forEach((name) => declared.add(name));
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id !== null) declared.add(node.id.name);
  }
  const symbols: SemanticSymbol[] = [];
  for (const node of declarations) {
    if (node.type === "FunctionDeclaration" && node.id !== null) {
      symbols.push({ id: `${file}#${node.id.name}`, file, name: node.id.name, kind: "function", node });
    }
    if (node.type !== "VariableDeclaration") continue;
    for (const item of node.declarations) {
      if (item.id.type !== "Identifier") continue;
      const common = { id: `${file}#${item.id.name}`, file, name: item.id.name, node: item.init ?? item };
      if (node.kind !== "const" || item.init === null) { symbols.push({ ...common, kind: "unknown" }); continue; }
      if (isFunction(item.init)) symbols.push({ ...common, kind: "function" });
      else if (item.init.type === "Identifier") symbols.push({ ...common, kind: "alias", alias: item.init.name });
      else if (item.init.type === "NewExpression" && item.init.callee.type === "Identifier"
        && ["Map", "WeakMap"].includes(item.init.callee.name) && !declared.has(item.init.callee.name)) {
        symbols.push({ ...common, kind: "cache", retention: item.init.callee.name === "WeakMap" ? "weak-key" : "strong-key" });
      } else symbols.push({ ...common, kind: "unknown" });
    }
  }
  return symbols;
}

/** Ambiguous export stars, cycles, namespaces, and unsupported symbols stay unknown. */
export function resolveSymbol(file: string, name: string, symbols: ReadonlyMap<string, SemanticSymbol>, context: RepositoryContext, maxDepth: number, visited: ReadonlySet<string> = new Set(), budget = { remaining: 256 }): SemanticSymbol | undefined {
  const key = `${file}#${name}`;
  if (visited.has(key) || visited.size >= maxDepth || budget.remaining-- <= 0) return undefined;
  const next = new Set([...visited, key]);
  const local = symbols.get(key);
  if (local !== undefined) return local.kind === "alias" && local.alias !== undefined ? resolveSymbol(file, local.alias, symbols, context, maxDepth, next, budget) : local;
  const imports = context.imports.filter((item) => item.from === file).flatMap((item) => item.bindings
    .filter((binding) => binding.localName === name && !binding.typeOnly && binding.importedName !== "*")
    .map((binding) => ({ file: item.resolvedPath, name: binding.importedName })));
  if (imports.length !== 1 || imports[0].file === undefined) return undefined;
  return resolveExport(imports[0].file, imports[0].name, symbols, context, maxDepth, next, budget);
}

function resolveExport(file: string, name: string, symbols: ReadonlyMap<string, SemanticSymbol>, context: RepositoryContext, maxDepth: number, visited: ReadonlySet<string>, budget: { remaining: number }): SemanticSymbol | undefined {
  const key = `export:${file}#${name}`;
  if (visited.has(key) || visited.size >= maxDepth || budget.remaining-- <= 0) return undefined;
  const next = new Set([...visited, key]);
  const exports = context.exports.filter((item) => item.from === file && item.exportedName === name && item.kind !== "star");
  if (exports.length > 1) return undefined;
  const item = exports[0];
  if (item !== undefined) return item.resolvedPath === undefined
    ? resolveSymbol(file, item.localName ?? name, symbols, context, maxDepth, next, budget)
    : resolveExport(item.resolvedPath, item.localName ?? name, symbols, context, maxDepth, next, budget);
  const stars = context.exports.filter((entry) => entry.from === file && entry.kind === "star" && name !== "default");
  if (stars.some((entry) => entry.resolvedPath === undefined)) return undefined;
  const candidates = stars
    .flatMap((entry) => entry.resolvedPath === undefined ? [] : [resolveExport(entry.resolvedPath, name, symbols, context, maxDepth, next, budget)])
    .filter((entry) => entry !== undefined);
  if (budget.remaining <= 0) return undefined;
  const unique = [...new Map(candidates.map((entry) => [entry.id, entry])).values()];
  return unique.length === 1 ? unique[0] : undefined;
}
