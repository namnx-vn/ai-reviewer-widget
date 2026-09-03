import type { RepositoryContext } from "../repository-context";
import type {
  AnalyzerFileChange,
  ChangedRange,
  IncrementalAnalysisScope,
} from "./contracts";

export interface IncrementalScopeOptions {
  readonly now?: () => number;
}

export function calculateIncrementalAnalysisScope(
  changes: readonly AnalyzerFileChange[],
  repositoryContext: RepositoryContext,
  options: IncrementalScopeOptions = {},
): IncrementalAnalysisScope {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const normalizedChanges = [...changes]
    .map((change) => ({
      ...change,
      path: normalizePath(change.path),
      previousPath: change.previousPath === undefined ? undefined : normalizePath(change.previousPath),
      ranges: normalizeRanges(change.ranges ?? []),
    }))
    .sort((left, right) => `${left.path}:${left.previousPath ?? ""}`.localeCompare(`${right.path}:${right.previousPath ?? ""}`));

  const changedFiles = uniqueSorted(normalizedChanges
    .filter((change) => change.status !== "deleted")
    .map((change) => change.path));
  const deletedFiles = uniqueSorted(normalizedChanges
    .filter((change) => change.status === "deleted")
    .map((change) => change.previousPath ?? change.path));
  const renamedFiles = normalizedChanges
    .filter((change): change is typeof change & { previousPath: string } =>
      change.status === "renamed" && change.previousPath !== undefined,
    )
    .map((change) => ({ from: change.previousPath, to: change.path }));

  const changedRanges: Record<string, readonly ChangedRange[]> = {};
  for (const change of normalizedChanges) {
    if (change.status === "deleted" || (change.ranges?.length ?? 0) === 0) continue;
    changedRanges[change.path] = change.ranges ?? [];
  }

  const impactSeeds = new Set([
    ...changedFiles,
    ...deletedFiles,
    ...renamedFiles.map(({ from }) => from),
  ]);
  const impactedFiles = calculateImpactedFiles(impactSeeds, repositoryContext);
  const changedSymbols = uniqueSorted(repositoryContext.declarations
    .filter((declaration) => impactSeeds.has(declaration.file))
    .map((declaration) => `${declaration.file}#${declaration.name}`));
  const changedExports = uniqueSorted(repositoryContext.exports
    .filter((entry) => impactSeeds.has(entry.from))
    .map((entry) => `${entry.from}#${entry.exportedName}`));
  const impactedPackages = uniqueSorted(repositoryContext.packages
    .filter((pkg) => impactedFiles.some((file) => isWithin(file, pkg.root)))
    .map((pkg) => pkg.name ?? pkg.root || "."));

  return {
    changedFiles,
    changedRanges,
    changedSymbols,
    changedExports,
    impactedFiles,
    impactedPackages,
    deletedFiles,
    renamedFiles,
    metrics: {
      runtimeMs: now() - startedAt,
      changedFileCount: changedFiles.length + deletedFiles.length,
      impactedFileCount: impactedFiles.length,
    },
  };
}

function calculateImpactedFiles(
  seeds: ReadonlySet<string>,
  repositoryContext: RepositoryContext,
): readonly string[] {
  const reverseDependencies = new Map<string, Set<string>>();
  for (const relationship of repositoryContext.imports) {
    if (relationship.resolvedPath === undefined) continue;
    const dependents = reverseDependencies.get(relationship.resolvedPath) ?? new Set<string>();
    dependents.add(relationship.from);
    reverseDependencies.set(relationship.resolvedPath, dependents);
  }
  for (const relationship of repositoryContext.exports) {
    if (relationship.resolvedPath === undefined) continue;
    const dependents = reverseDependencies.get(relationship.resolvedPath) ?? new Set<string>();
    dependents.add(relationship.from);
    reverseDependencies.set(relationship.resolvedPath, dependents);
  }

  const impacted = new Set(seeds);
  const queue = [...seeds].sort();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const dependent of [...(reverseDependencies.get(current) ?? [])].sort()) {
      if (impacted.has(dependent)) continue;
      impacted.add(dependent);
      queue.push(dependent);
    }
  }
  return uniqueSorted([...impacted]);
}

function normalizeRanges(ranges: readonly ChangedRange[]): readonly ChangedRange[] {
  return [...ranges]
    .filter(({ startLine, endLine }) => Number.isInteger(startLine) && Number.isInteger(endLine) && startLine > 0 && endLine >= startLine)
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function normalizePath(path: string): string {
  const result: string[] = [];
  for (const segment of path.replace(/\\/g, "/").replace(/^\.\//, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop(); else result.push(segment);
  }
  return result.join("/");
}

function isWithin(path: string, root: string): boolean {
  return root === "" || path === root || path.startsWith(`${root}/`);
}
