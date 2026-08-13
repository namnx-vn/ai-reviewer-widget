import { buildDependencyGraph } from "../../architecture/analyzer";
import type { SourceFile } from "../../architecture/types";
import type { PerformanceRepositoryContext } from "../model/types";

export function createPerformanceRepositoryContext(
  files: readonly SourceFile[],
): PerformanceRepositoryContext {
  const sourceFiles = files.filter((file) => isSourceFile(file.path));

  return {
    dependencyGraph: buildDependencyGraph(sourceFiles),
    dependencyVersions: collectDependencyVersions(files),
  };
}

function collectDependencyVersions(
  files: readonly SourceFile[],
): ReadonlyMap<string, readonly string[]> {
  const versions = new Map<string, Set<string>>();

  for (const file of files) {
    if (!/(^|\/)package-lock\.json$/.test(normalizePath(file.path))) continue;
    const parsed = parseJsonObject(file.content);
    if (parsed === undefined) continue;
    const packages = getObject(parsed, "packages");
    if (packages === undefined) continue;

    for (const [packagePath, metadata] of Object.entries(packages)) {
      const packageName = packageNameFromLockPath(packagePath);
      if (packageName === undefined || !isRecord(metadata)) continue;
      const version = metadata.version;
      if (typeof version !== "string" || version.length === 0) continue;
      const packageVersions = versions.get(packageName) ?? new Set<string>();
      packageVersions.add(version);
      versions.set(packageName, packageVersions);
    }
  }

  return new Map(
    [...versions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, values]) => [name, [...values].sort()] as const),
  );
}

function parseJsonObject(source: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const value: unknown = JSON.parse(source);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function getObject(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function packageNameFromLockPath(path: string): string | undefined {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  if (index < 0) return undefined;
  const tail = path.slice(index + marker.length);
  if (tail.length === 0) return undefined;
  if (!tail.startsWith("@")) return tail.split("/")[0];
  const [scope, name] = tail.split("/");
  return scope !== undefined && name !== undefined ? `${scope}/${name}` : undefined;
}

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
