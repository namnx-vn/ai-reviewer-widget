import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { buildDependencyGraph } from "../../architecture/analyzer";
import { parseSource } from "../../ast/parser";
import type {
  PerformanceCostKind,
  PerformanceFunctionSummary,
  PerformanceInterproceduralResult,
  PerformanceParameterEffect,
  PerformanceRuleContext,
} from "../model/types";
import { callPath, visit } from "../rules/ast-utils";

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_SUMMARIES = 2_000;

export interface PerformanceInterproceduralFile {
  readonly path: string;
  readonly content: string;
}

export interface PerformanceInterproceduralOptions {
  readonly maxDepth?: number;
  readonly maxSummaries?: number;
  readonly databaseCallPaths?: readonly string[];
}

interface FunctionRecord {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly node: FunctionNode;
  readonly exported: boolean;
  readonly importBindings: ReadonlyMap<string, ImportBinding>;
}

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

interface ImportBinding {
  readonly resolvedPath: string;
  readonly importedName: string;
}

interface DirectSummary {
  readonly directCostKinds: readonly PerformanceCostKind[];
  readonly calls: readonly string[];
  readonly unknownCalls: readonly string[];
  readonly parameterEffects: readonly PerformanceParameterEffect[];
  readonly returnCalls: readonly string[];
}

export function analyzeInterproceduralPerformanceFiles(
  files: readonly PerformanceInterproceduralFile[],
  options: PerformanceInterproceduralOptions = {},
): PerformanceInterproceduralResult {
  const sourceFiles = files.filter((file) => isSourceFile(file.path));
  const graph = buildDependencyGraph(sourceFiles);
  const programs = new Map<string, TSESTree.Program>();

  for (const file of sourceFiles) {
    try {
      programs.set(normalizePath(file.path), parseSource(file.content));
    } catch {
      // Parse failures are isolated by the parent analyzer; interprocedural analysis skips them.
    }
  }

  const importBindingsByFile = new Map<string, ReadonlyMap<string, ImportBinding>>();
  for (const [file, program] of programs) {
    importBindingsByFile.set(file, collectImportBindings(file, program, graph));
  }

  const functions = new Map<string, FunctionRecord>();
  for (const [file, program] of programs) {
    const bindings = importBindingsByFile.get(file) ?? new Map<string, ImportBinding>();
    for (const record of collectFunctions(file, program, bindings)) {
      if (functions.size >= (options.maxSummaries ?? DEFAULT_MAX_SUMMARIES)) break;
      functions.set(record.id, record);
    }
  }

  const direct = new Map<string, DirectSummary>();
  for (const [id, record] of functions) {
    direct.set(id, inspectFunction(record, functions, options));
  }

  const maxDepth = Math.max(1, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const summaries = [...functions.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((record) => summarize(record, direct, functions, maxDepth));

  const callGraph = new Map<string, readonly string[]>(
    [...direct.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, summary]) => [id, summary.calls] as const),
  );

  return { summaries, callGraph };
}

function collectImportBindings(
  file: string,
  program: TSESTree.Program,
  graph: ReturnType<typeof buildDependencyGraph>,
): ReadonlyMap<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  const edges = graph.edges.filter((edge) => normalizePath(edge.from) === file && edge.resolvedPath !== undefined);

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
    const edge = edges.find((candidate) => candidate.specifier === statement.source.value);
    if (edge?.resolvedPath === undefined) continue;
    const resolvedPath = normalizePath(edge.resolvedPath);

    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        const importedName = specifier.imported.type === "Identifier"
          ? specifier.imported.name
          : String(specifier.imported.value);
        bindings.set(specifier.local.name, { resolvedPath, importedName });
      } else if (specifier.type === "ImportDefaultSpecifier") {
        bindings.set(specifier.local.name, { resolvedPath, importedName: "default" });
      }
    }
  }

  return bindings;
}

function collectFunctions(
  file: string,
  program: TSESTree.Program,
  importBindings: ReadonlyMap<string, ImportBinding>,
): readonly FunctionRecord[] {
  const exportedNames = collectExportedNames(program);
  const records: FunctionRecord[] = [];

  for (const statement of program.body) {
    if (statement.type === "FunctionDeclaration" && statement.id !== null) {
      records.push({
        id: functionId(file, statement.id.name),
        name: statement.id.name,
        file,
        node: statement,
        exported: exportedNames.has(statement.id.name),
        importBindings,
      });
      continue;
    }

    const declaration = unwrapVariableDeclaration(statement);
    if (declaration === undefined) continue;
    for (const item of declaration.declarations) {
      if (item.id.type !== "Identifier" || item.init === null) continue;
      if (item.init.type !== "ArrowFunctionExpression" && item.init.type !== "FunctionExpression") continue;
      records.push({
        id: functionId(file, item.id.name),
        name: item.id.name,
        file,
        node: item.init,
        exported: exportedNames.has(item.id.name),
        importBindings,
      });
    }
  }

  const defaultExport = program.body.find((statement) => statement.type === "ExportDefaultDeclaration");
  if (defaultExport?.type === "ExportDefaultDeclaration") {
    const declaration = defaultExport.declaration;
    if (declaration.type === "FunctionDeclaration") {
      const name = declaration.id?.name ?? "default";
      records.push({
        id: functionId(file, "default"),
        name,
        file,
        node: declaration,
        exported: true,
        importBindings,
      });
    } else if (declaration.type === "ArrowFunctionExpression" || declaration.type === "FunctionExpression") {
      records.push({
        id: functionId(file, "default"),
        name: "default",
        file,
        node: declaration,
        exported: true,
        importBindings,
      });
    }
  }

  return deduplicateFunctions(records);
}

function collectExportedNames(program: TSESTree.Program): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration") {
      const declaration = statement.declaration;
      if (declaration?.type === "FunctionDeclaration" && declaration.id !== null) names.add(declaration.id.name);
      if (declaration?.type === "VariableDeclaration") {
        for (const item of declaration.declarations) if (item.id.type === "Identifier") names.add(item.id.name);
      }
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === "Identifier") names.add(specifier.local.name);
      }
    }
  }
  return names;
}

function unwrapVariableDeclaration(statement: TSESTree.ProgramStatement): TSESTree.VariableDeclaration | undefined {
  if (statement.type === "VariableDeclaration") return statement;
  return statement.type === "ExportNamedDeclaration" && statement.declaration?.type === "VariableDeclaration"
    ? statement.declaration
    : undefined;
}

function inspectFunction(
  record: FunctionRecord,
  functions: ReadonlyMap<string, FunctionRecord>,
  options: PerformanceInterproceduralOptions,
): DirectSummary {
  const costs = new Set<PerformanceCostKind>();
  const calls = new Set<string>();
  const unknownCalls = new Set<string>();
  const returnCalls = new Set<string>();
  const parameterEffects = collectParameterEffects(record.node);
  const body = record.node.body;

  visit(body, (node, ancestors) => {
    if (node.type !== "CallExpression") return;
    const path = callPath(node);
    if (path === undefined) return;
    const kinds = costKinds(path, options);
    kinds.forEach((kind) => costs.add(kind));
    if (kinds.length > 0) return;

    const resolved = resolveCall(record, path, functions);
    if (resolved === undefined) {
      unknownCalls.add(path);
      return;
    }
    calls.add(resolved);
    if (ancestors.some((ancestor) => ancestor.type === "ReturnStatement")) returnCalls.add(resolved);
  });

  return {
    directCostKinds: [...costs].sort(),
    calls: [...calls].sort(),
    unknownCalls: [...unknownCalls].sort(),
    parameterEffects,
    returnCalls: [...returnCalls].sort(),
  };
}

function resolveCall(
  record: FunctionRecord,
  path: string,
  functions: ReadonlyMap<string, FunctionRecord>,
): string | undefined {
  if (!path.includes(".")) {
    const localId = functionId(record.file, path);
    if (functions.has(localId)) return localId;
    const binding = record.importBindings.get(path);
    if (binding !== undefined) {
      const importedId = functionId(binding.resolvedPath, binding.importedName);
      if (functions.has(importedId)) return importedId;
    }
  }
  return undefined;
}

function summarize(
  record: FunctionRecord,
  direct: ReadonlyMap<string, DirectSummary>,
  functions: ReadonlyMap<string, FunctionRecord>,
  maxDepth: number,
): PerformanceFunctionSummary {
  const own = direct.get(record.id) ?? emptyDirectSummary();
  const costs = new Set<PerformanceCostKind>(own.directCostKinds);
  const returnCosts = new Set<PerformanceCostKind>();
  const unknown = new Set<string>(own.unknownCalls);
  const visited = new Set<string>([record.id]);

  const walk = (current: string, depth: number, isReturnPath: boolean): void => {
    if (depth >= maxDepth) return;
    const summary = direct.get(current);
    if (summary === undefined) return;
    for (const call of summary.calls) {
      if (!functions.has(call)) {
        unknown.add(call);
        continue;
      }
      const child = direct.get(call);
      child?.directCostKinds.forEach((kind) => {
        costs.add(kind);
        if (isReturnPath || summary.returnCalls.includes(call)) returnCosts.add(kind);
      });
      child?.unknownCalls.forEach((unknownCall) => unknown.add(unknownCall));
      if (visited.has(call)) continue;
      visited.add(call);
      walk(call, depth + 1, isReturnPath || summary.returnCalls.includes(call));
    }
  };

  own.returnCalls.forEach((call) => direct.get(call)?.directCostKinds.forEach((kind) => returnCosts.add(kind)));
  walk(record.id, 0, false);

  return {
    name: record.name,
    file: record.file,
    exported: record.exported,
    directCostKinds: own.directCostKinds,
    costKinds: [...costs].sort(),
    calls: own.calls,
    unknownCalls: [...unknown].sort(),
    parameterEffects: own.parameterEffects,
    returnsCostKinds: [...returnCosts].sort(),
  };
}

function collectParameterEffects(node: FunctionNode): readonly PerformanceParameterEffect[] {
  const effects = new Map<string, PerformanceParameterEffect>();
  const parameters = node.params.flatMap((parameter, index) =>
    parameter.type === "Identifier" ? [{ name: parameter.name, index }] : [],
  );

  for (const parameter of parameters) {
    visit(node.body, (child, ancestors) => {
      if (isLoopNode(child) && loopUsesIdentifier(child, parameter.name)) {
        effects.set(`${parameter.index}:iteration-size`, { parameterIndex: parameter.index, effect: "iteration-size" });
      }
      if (child.type === "CallExpression" && child.callee.type === "Identifier" && child.callee.name === parameter.name && ancestors.some(isLoopNode)) {
        effects.set(`${parameter.index}:callback-repeated`, { parameterIndex: parameter.index, effect: "callback-repeated" });
      }
      if (child.type === "CallExpression" && ["fetch", "request"].includes(callPath(child) ?? "") && containsIdentifier(child, parameter.name)) {
        effects.set(`${parameter.index}:request-input`, { parameterIndex: parameter.index, effect: "request-input" });
      }
    });
  }

  return [...effects.values()].sort((left, right) => left.parameterIndex - right.parameterIndex || left.effect.localeCompare(right.effect));
}

function loopUsesIdentifier(node: TSESTree.Node, name: string): boolean {
  if (node.type === "ForOfStatement" || node.type === "ForInStatement") return containsIdentifier(node.right, name);
  if (node.type === "ForStatement") return node.test !== null && containsIdentifier(node.test, name);
  if (node.type === "WhileStatement" || node.type === "DoWhileStatement") return containsIdentifier(node.test, name);
  return false;
}

function containsIdentifier(node: TSESTree.Node, name: string): boolean {
  let found = false;
  visit(node, (child) => {
    if (child.type === "Identifier" && child.name === name) found = true;
  });
  return found;
}

function costKinds(path: string, options: PerformanceInterproceduralOptions): readonly PerformanceCostKind[] {
  if (path === "fetch" || path === "request" || path.startsWith("axios.")) return ["network", "external-service"];
  if (path === "JSON.stringify" || path === "JSON.parse") return ["serialization"];
  if ((options.databaseCallPaths ?? []).includes(path)) return ["database"];
  if (["sort", "toSorted"].some((name) => path.endsWith(`.${name}`))) return ["cpu-heavy"];
  return [];
}

function emptyDirectSummary(): DirectSummary {
  return { directCostKinds: [], calls: [], unknownCalls: [], parameterEffects: [], returnCalls: [] };
}

function deduplicateFunctions(records: readonly FunctionRecord[]): readonly FunctionRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function functionId(file: string, name: string): string {
  return `${normalizePath(file)}#${name}`;
}

function isLoopNode(node: TSESTree.Node): boolean {
  return node.type === "ForStatement"
    || node.type === "ForInStatement"
    || node.type === "ForOfStatement"
    || node.type === "WhileStatement"
    || node.type === "DoWhileStatement";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path);
}

export function createInterproceduralContext(
  file: PerformanceInterproceduralFile,
): PerformanceRuleContext {
  return { file: file.path, source: file.content, ast: parseSource(file.content) };
}
