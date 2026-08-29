import { parseSource } from "../ast/parser";
import type { ReviewFinding } from "../../domain/review";
import type { ArchitectureRule, DependencyGraph, ImportEdge, SourceFile } from "./types";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export function extractImportEdges(file: string, source: string): ImportEdge[] {
  const program = parseSource(source);
  return program.body.flatMap((statement) => {
    if (statement.type !== "ImportDeclaration") return [];
    return [{ from: file, specifier: statement.source.value, line: statement.source.loc.start.line, column: statement.source.loc.start.column }];
  });
}

export function buildDependencyGraph(files: readonly SourceFile[]): DependencyGraph {
  const knownFiles = new Set(files.map((file) => normalizePath(file.path)));
  return {
    files: [...knownFiles],
    edges: files.flatMap((file) => extractImportEdges(file.path, file.content).map((edge) => ({
      ...edge,
      resolvedPath: resolveImport(edge.from, edge.specifier, knownFiles),
    }))),
  };
}

export function analyzeArchitecture(file: string, source: string, rules: readonly ArchitectureRule[]): ReviewFinding[] {
  return analyzeArchitectureGraph(buildDependencyGraph([{ path: file, content: source }]), rules);
}

export function analyzeArchitectureGraph(graph: DependencyGraph, rules: readonly ArchitectureRule[]): ReviewFinding[] {
  return graph.edges.flatMap((edge) => rules.flatMap((rule) => {
    if (!rule.check(edge.from, edge.specifier)) return [];
    return [{
      id: `${rule.id}:${edge.from}:${edge.line}`,
      ruleId: rule.id,
      title: "Micro-Frontend boundary violation",
      message: rule.description,
      severity: "high",
      source: "architecture",
      location: { file: edge.from, line: edge.line, column: edge.column },
      suggestion: "Move the dependency behind a shared package or explicit domain contract.",
      confidence: 1,
    }];
  }));
}

function resolveImport(from: string, specifier: string, knownFiles: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalizePath(joinDirectory(from, specifier));
  const candidates = [base, ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`)];
  return candidates.find((candidate) => knownFiles.has(candidate));
}

function joinDirectory(file: string, specifier: string): string {
  const normalized: string[] = [];
  for (const segment of [...file.split("/").slice(0, -1), ...specifier.split("/")]) {
    if (!segment || segment === ".") continue;
    if (segment === "..") { normalized.pop(); continue; }
    normalized.push(segment);
  }
  return normalized.join("/");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}
