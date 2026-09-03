import type { AnalyzerSourceFile, RepositoryContext } from "../analyzer";

export interface AIContextBudget {
  readonly maximumFiles: number;
  readonly maximumCharacters: number;
  readonly maximumDependencyDepth: number;
  readonly maximumRelatedSymbols: number;
}

export interface AIContextSelectionInput {
  readonly files: readonly AnalyzerSourceFile[];
  readonly changedPaths: readonly string[];
  readonly repositoryContext: RepositoryContext;
  readonly budget: AIContextBudget;
}

export interface AIContextSelectedFile {
  readonly path: string;
  readonly content: string;
  readonly dependencyDepth: number;
  readonly relatedSymbols: readonly string[];
}

export interface AIContextSelection {
  readonly files: readonly AIContextSelectedFile[];
  readonly omittedFiles: number;
  readonly omittedCharacters: number;
  readonly truncated: boolean;
}

export const DEFAULT_AI_CONTEXT_BUDGET: AIContextBudget = Object.freeze({
  maximumFiles: 8,
  maximumCharacters: 40_000,
  maximumDependencyDepth: 2,
  maximumRelatedSymbols: 40,
});

export function selectAIRepositoryContext(input: AIContextSelectionInput): AIContextSelection {
  validateBudget(input.budget);
  const filesByPath = new Map(input.files.map((file) => [normalizePath(file.path), file]));
  const changed = [...new Set(input.changedPaths.map(normalizePath))]
    .filter((path) => filesByPath.has(path))
    .sort();
  const depths = calculateRelevantDepths(changed, input.repositoryContext, input.budget.maximumDependencyDepth);
  const candidates = [...depths]
    .filter(([path]) => !changed.includes(path) && filesByPath.has(path))
    .sort(([leftPath, leftDepth], [rightPath, rightDepth]) =>
      leftDepth - rightDepth || leftPath.localeCompare(rightPath),
    );
  const limited = candidates.slice(0, input.budget.maximumFiles);
  let remainingCharacters = input.budget.maximumCharacters;
  let omittedCharacters = 0;
  let relatedSymbolCount = 0;
  const selected: AIContextSelectedFile[] = [];

  for (const [path, dependencyDepth] of limited) {
    const file = filesByPath.get(path);
    if (file === undefined || remainingCharacters <= 0) break;
    const content = file.content.slice(0, remainingCharacters);
    omittedCharacters += Math.max(0, file.content.length - content.length);
    remainingCharacters -= content.length;
    const symbols = input.repositoryContext.declarations
      .filter((declaration) => declaration.file === path)
      .map((declaration) => declaration.name)
      .sort()
      .slice(0, Math.max(0, input.budget.maximumRelatedSymbols - relatedSymbolCount));
    relatedSymbolCount += symbols.length;
    selected.push({ path, content, dependencyDepth, relatedSymbols: symbols });
  }

  const omittedFiles = Math.max(0, candidates.length - selected.length);
  return {
    files: selected,
    omittedFiles,
    omittedCharacters,
    truncated: omittedFiles > 0 || omittedCharacters > 0,
  };
}

function calculateRelevantDepths(
  changedPaths: readonly string[],
  repositoryContext: RepositoryContext,
  maximumDepth: number,
): ReadonlyMap<string, number> {
  const neighbors = new Map<string, Set<string>>();
  const connect = (left: string, right: string): void => {
    const leftNeighbors = neighbors.get(left) ?? new Set<string>();
    leftNeighbors.add(right);
    neighbors.set(left, leftNeighbors);
  };
  for (const relationship of repositoryContext.imports) {
    if (relationship.resolvedPath === undefined) continue;
    connect(relationship.from, relationship.resolvedPath);
    connect(relationship.resolvedPath, relationship.from);
  }
  for (const relationship of repositoryContext.exports) {
    if (relationship.resolvedPath === undefined) continue;
    connect(relationship.from, relationship.resolvedPath);
    connect(relationship.resolvedPath, relationship.from);
  }

  const depths = new Map<string, number>();
  const queue = changedPaths.map((path) => ({ path, depth: 0 }));
  for (const path of changedPaths) depths.set(path, 0);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current.depth >= maximumDepth) continue;
    for (const neighbor of [...(neighbors.get(current.path) ?? [])].sort()) {
      const depth = current.depth + 1;
      const previous = depths.get(neighbor);
      if (previous !== undefined && previous <= depth) continue;
      depths.set(neighbor, depth);
      queue.push({ path: neighbor, depth });
    }
  }
  return depths;
}

function validateBudget(budget: AIContextBudget): void {
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`AI context budget ${name} must be a non-negative integer.`);
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}
