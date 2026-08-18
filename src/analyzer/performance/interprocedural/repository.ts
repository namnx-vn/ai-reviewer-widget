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

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type ProgramStatement = TSESTree.Program["body"][number];
type FunctionDeclarationStatement = TSESTree.FunctionDeclaration | TSESTree.VariableDeclaration;

export interface PerformanceInterproceduralFile {
  readonly path: string;
  readonly content: string;
}

export interface PerformanceInterproceduralOptions {
  readonly maxDepth?: number;
  readonly maxSummaries?: number;
  readonly databaseCallPaths?: readonly string[];
}

interface ImportBinding {
  readonly resolvedPath: string;
  readonly importedName: string;
}

interface FunctionRecord {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly node: FunctionNode;
  readonly exported: boolean;
  readonly imports: ReadonlyMap<string, ImportBinding>;
}

interface DirectSummary {
  readonly directCostKinds: readonly PerformanceCostKind[];
  readonly calls: readonly string[];
  readonly unknownCalls: readonly string[];
  readonly returnCalls: readonly string[];
  readonly parameterEffects: readonly PerformanceParameterEffect[];
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
      // The parent analyzer owns parse warnings; interprocedural analysis stays fail-soft.
    }
  }

  const functions = new Map<string, FunctionRecord>();
  const maxSummaries = Math.max(1, options.maxSummaries ?? DEFAULT_MAX_SUMMARIES);
  for (const [file, program] of programs) {
    const imports = collectImportBindings(file, program, graph);
    for (const record of collectFunctions(file, program, imports)) {
      if (functions.size >= maxSummaries) break;
      functions.set(record.id, record);
    }
    if (functions.size >= maxSummaries) break;
  }

  const direct = new Map<string, DirectSummary>();
  for (const [id, record] of functions) direct.set(id, inspectFunction(record, functions, options));

  const maxDepth = Math.max(1, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const summaries = [...functions.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((record) => summarize(record, direct, functions, maxDepth));

  return {
    summaries,
    callGraph: new Map(
      [...direct.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, summary]) => [id, summary.calls] as const),
    ),
  };
}

function collectImportBindings(
  file: string,
  program: TSESTree.Program,
  graph: ReturnType<typeof buildDependencyGraph>,
): ReadonlyMap<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  const edges = graph.edges.filter(
    (edge) => normalizePath(edge.from) === file && edge.resolvedPath !== undefined,
  );

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
    const edge = edges.find((candidate) => candidate.specifier === statement.source.value);
    if (edge?.resolvedPath === undefined) continue;
    const resolvedPath = normalizePath(edge.resolvedPath);

    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportDefaultSpecifier") {
        bindings.set(specifier.local.name, { resolvedPath, importedName: "default" });
        continue;
      }
      if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue;
      const importedName = specifier.imported.type === "Identifier"
        ? specifier.imported.name
        : String(specifier.imported.value);
      bindings.set(specifier.local.name, { resolvedPath, importedName });
    }
  }

  return bindings;
}

function collectFunctions(
  file: string,
  program: TSESTree.Program,
  imports: ReadonlyMap<string, ImportBinding>,
): readonly FunctionRecord[] {
  const exportedNames = collectExportedNames(program);
  const records: FunctionRecord[] = [];

  for (const statement of program.body) {
    const declaration = unwrapNamedExport(statement);
    if (declaration?.type === "FunctionDeclaration" && declaration.id !== null) {
      records.push(createRecord(file, declaration.id.name, declaration, exportedNames.has(declaration.id.name), imports));
      continue;
    }
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const item of declaration.declarations) {
      if (item.id.type !== "Identifier" || item.init === null) continue;
      if (item.init.type !== "ArrowFunctionExpression" && item.init.type !== "FunctionExpression") continue;
      records.push(createRecord(file, item.id.name, item.init, exportedNames.has(item.id.name), imports));
    }
  }

  for (const statement of program.body) {
    if (statement.type !== "ExportDefaultDeclaration") continue;
    const declaration = statement.declaration;
    if (declaration.type === "FunctionDeclaration") {
      records.push(createRecord(file, "default", declaration, true, imports, declaration.id?.name ?? "default"));
    } else if (declaration.type === "ArrowFunctionExpression" || declaration.type === "FunctionExpression") {
      records.push(createRecord(file, "default", declaration, true, imports));
    }
  }

  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function unwrapNamedExport(statement: ProgramStatement): FunctionDeclarationStatement | null {
  if (statement.type === "ExportNamedDeclaration") {
    const declaration = statement.declaration;
    return declaration?.type === "FunctionDeclaration" || declaration?.type === "VariableDeclaration"
      ? declaration
      : null;
  }
  return statement.type === "FunctionDeclaration" || statement.type === "VariableDeclaration"
    ? statement
    : null;
}

function collectExportedNames(program: TSESTree.Program): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const declaration = statement.declaration;
    if (declaration?.type === "FunctionDeclaration" && declaration.id !== null) names.add(declaration.id.name);
    if (declaration?.type === "VariableDeclaration") {
      for (const item of declaration.declarations) if (item.id.type === "Identifier") names.add(item.id.name);
    }
    for (const specifier of statement.specifiers) {
      names.add(specifier.local.type === "Identifier" ? specifier.local.name : String(specifier.local.value));
    }
  }
  return names;
}

function createRecord(
  file: string,
  exportName: string,
  node: FunctionNode,
  exported: boolean,
  imports: ReadonlyMap<string, ImportBinding>,
  displayName = exportName,
): FunctionRecord {
  return {
    id: functionId(file, exportName),
    name: displayName,
    file,
    node,
    exported,
    imports,
  };
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

  visit(record.node.body, (node, ancestors) => {
    if (node.type !== "CallExpression") return;
    const path = callPath(node);
    if (path === undefined) return;
    const kinds = costKinds(path, options);
    if (kinds.length > 0) {
      kinds.forEach((kind) => costs.add(kind));
      return;
    }

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
    returnCalls: [...returnCalls].sort(),
    parameterEffects: collectParameterEffects(record.node),
  };
}

function resolveCall(
  record: FunctionRecord,
  path: string,
  functions: ReadonlyMap<string, FunctionRecord>,
): string | undefined {
  if (path.includes(".")) return undefined;
  const local = functionId(record.file, path);
  if (functions.has(local)) return local;
  const imported = record.imports.get(path);
  if (imported === undefined) return undefined;
  const importedId = functionId(imported.resolvedPath, imported.importedName);
  return functions.has(importedId) ? importedId : undefined;
}

function summarize(
  record: FunctionRecord,
  direct: ReadonlyMap<string, DirectSummary>,
  functions: ReadonlyMap<string, FunctionRecord>,
  maxDepth: number,
): PerformanceFunctionSummary {
  const root = direct.get(record.id) ?? emptyDirectSummary();
  const costs = new Set<PerformanceCostKind>(root.directCostKinds);
  const returnCosts = new Set<PerformanceCostKind>();
  const unknown = new Set(root.unknownCalls);

  const walk = (
    current: string,
    depth: number,
    path: ReadonlySet<string>,
    returning: boolean,
  ): void => {
    if (depth >= maxDepth) return;
    const summary = direct.get(current);
    if (summary === undefined) return;
    for (const call of summary.calls) {
      const child = direct.get(call);
      if (child === undefined || !functions.has(call)) {
        unknown.add(call);
        continue;
      }
      const childReturning = returning || summary.returnCalls.includes(call);
      child.directCostKinds.forEach((kind) => {
        costs.add(kind);
        if (childReturning) returnCosts.add(kind);
      });
      child.unknownCalls.forEach((unknownCall) => unknown.add(unknownCall));
      if (path.has(call)) continue;
      walk(call, depth + 1, new Set([...path, call]), childReturning);
    }
  };

  walk(record.id, 0, new Set([record.id]), false);

  return {
    name: record.name,
    file: record.file,
    exported: record.exported,
    directCostKinds: root.directCostKinds,
    costKinds: [...costs].sort(),
    calls: root.calls,
    unknownCalls: [...unknown].sort(),
    parameterEffects: root.parameterEffects,
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
      if (isLoop(child) && loopUsesIdentifier(child, parameter.name)) {
        addEffect(effects, parameter.index, "iteration-size");
      }
      if (child.type === "CallExpression"
        && child.callee.type === "Identifier"
        && child.callee.name === parameter.name
        && ancestors.some(isLoop)) {
        addEffect(effects, parameter.index, "callback-repeated");
      }
      if (child.type === "CallExpression"
        && ["fetch", "request"].includes(callPath(child) ?? "")
        && containsIdentifier(child, parameter.name)) {
        addEffect(effects, parameter.index, "request-input");
      }
    });
  }

  return [...effects.values()].sort(
    (left, right) => left.parameterIndex - right.parameterIndex || left.effect.localeCompare(right.effect),
  );
}

function addEffect(
  effects: Map<string, PerformanceParameterEffect>,
  parameterIndex: number,
  effect: PerformanceParameterEffect["effect"],
): void {
  effects.set(`${parameterIndex}:${effect}`, { parameterIndex, effect });
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

function costKinds(
  path: string,
  options: PerformanceInterproceduralOptions,
): readonly PerformanceCostKind[] {
  if (path === "fetch" || path === "request" || path.startsWith("axios.")) return ["network", "external-service"];
  if (path === "JSON.stringify" || path === "JSON.parse") return ["serialization"];
  if ((options.databaseCallPaths ?? []).includes(path)) return ["database"];
  if (path.endsWith(".sort") || path.endsWith(".toSorted")) return ["cpu-heavy"];
  return [];
}

function emptyDirectSummary(): DirectSummary {
  return {
    directCostKinds: [],
    calls: [],
    unknownCalls: [],
    returnCalls: [],
    parameterEffects: [],
  };
}

function functionId(file: string, name: string): string {
  return `${normalizePath(file)}#${name}`;
}

function isLoop(node: TSESTree.Node): boolean {
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
