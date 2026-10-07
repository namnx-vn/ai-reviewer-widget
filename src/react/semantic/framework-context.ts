export type FrameworkTriState = "enabled" | "disabled" | "unknown";
export type NextRouterMode = "app" | "pages" | "mixed" | "unknown";
export type NextRuntimeMode = "node" | "edge" | "mixed" | "unknown";

export interface FrameworkMinimumVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface FrameworkContext {
  readonly react: {
    readonly detected: boolean;
    readonly version?: string;
    readonly minimumVersion?: FrameworkMinimumVersion;
    readonly compiler: FrameworkTriState;
  };
  readonly nextjs?: {
    readonly version?: string;
    readonly minimumVersion?: FrameworkMinimumVersion;
    readonly router: NextRouterMode;
    readonly cacheComponents: boolean | "unknown";
    readonly runtime: NextRuntimeMode;
  };
}

export interface FrameworkContextFile {
  readonly path: string;
  readonly content?: string;
}

export interface FrameworkContextInput {
  readonly files?: readonly FrameworkContextFile[];
  readonly targetFile?: string;
}

type PackageDependencyMap = ReadonlyMap<string, readonly string[]>;

const NEXT_CONFIG_PATTERN = /(^|\/)next\.config\.(?:js|mjs|cjs|ts)$/;
const APP_ROUTE_PATTERN = /(^|\/)(?:src\/)?app(?:\/|$)/;
const PAGES_ROUTE_PATTERN = /(^|\/)(?:src\/)?pages(?:\/|$)/;

export function resolveFrameworkContext(input: FrameworkContextInput = {}): FrameworkContext {
  const allFiles = (input.files ?? []).map((file) => ({
    path: normalizePath(file.path),
    content: file.content ?? "",
  }));
  const packageRoots = collectPackageRoots(allFiles);
  const targetRoot = input.targetFile === undefined
    ? undefined
    : findNearestPackageRoot(normalizePath(input.targetFile), packageRoots);
  const files = input.targetFile === undefined
    ? allFiles
    : allFiles
        .filter((file) => findNearestPackageRoot(file.path, packageRoots) === targetRoot)
        .map((file) => ({
          ...file,
          path: targetRoot === undefined ? file.path : relativeToRoot(file.path, targetRoot),
        }));
  const dependencies = collectDependencies(files);
  const nextConfigFiles = files.filter((file) => NEXT_CONFIG_PATTERN.test(file.path));
  const hasNextConfig = nextConfigFiles.length > 0;
  const nextVersion = uniqueDependencyVersion(dependencies, "next");
  const hasNextSourceEvidence = files.some((file) => hasPackageImport(file.content, "next"));
  const hasNext = dependencies.has("next") || hasNextConfig || hasNextSourceEvidence;
  const reactVersion = dependencies.has("react")
    ? uniqueDependencyVersion(dependencies, "react")
    : uniqueDependencyVersion(dependencies, "react-dom");
  const hasReactDependency = dependencies.has("react") || dependencies.has("react-dom");
  const hasReactSourceEvidence = files.some((file) => hasPackageImport(file.content, "react"));
  const reactDetected = hasReactDependency || hasReactSourceEvidence || hasNext;
  const reactMinimumVersion = parseMinimumVersion(reactVersion);
  const nextMinimumVersion = parseMinimumVersion(nextVersion);

  return {
    react: {
      detected: reactDetected,
      version: reactVersion,
      ...(reactMinimumVersion === undefined ? {} : { minimumVersion: reactMinimumVersion }),
      compiler: resolveReactCompilerState(dependencies, nextConfigFiles),
    },
    nextjs: hasNext
      ? {
          version: nextVersion,
          ...(nextMinimumVersion === undefined ? {} : { minimumVersion: nextMinimumVersion }),
          router: resolveNextRouterMode(files),
          cacheComponents: resolveCacheComponents(nextConfigFiles),
          runtime: resolveNextRuntime(files),
        }
      : undefined,
  };
}

function collectDependencies(files: readonly FrameworkContextFile[]): PackageDependencyMap {
  const dependencies = new Map<string, Set<string>>();

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!/(^|\/)package\.json$/.test(normalizePath(file.path)) || file.content === undefined) {
      continue;
    }

    for (const [name, version] of readPackageDependencies(file.content)) {
      const versions = dependencies.get(name) ?? new Set<string>();
      versions.add(version);
      dependencies.set(name, versions);
    }
  }

  return new Map([...dependencies]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, versions]) => [name, [...versions].sort()]));
}

function readPackageDependencies(content: string): readonly [string, string][] {
  const parsed: unknown = parseJson(content);
  if (!isRecord(parsed)) {
    return [];
  }

  return [
    ...readDependencySection(parsed.dependencies),
    ...readDependencySection(parsed.devDependencies),
    ...readDependencySection(parsed.peerDependencies),
    ...readDependencySection(parsed.optionalDependencies),
  ];
}

function readDependencySection(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

function resolveReactCompilerState(
  dependencies: PackageDependencyMap,
  nextConfigFiles: readonly FrameworkContextFile[],
): FrameworkTriState {
  const explicitStates = collectBooleanOptionStates(nextConfigFiles, "reactCompiler");
  if (explicitStates.size > 1) {
    return "unknown";
  }

  if (explicitStates.has(false)) {
    return "disabled";
  }

  if (
    dependencies.has("babel-plugin-react-compiler") ||
    nextConfigFiles.some((file) => hasEnabledOption(file.content ?? "", "reactCompiler"))
  ) {
    return "enabled";
  }

  return "unknown";
}

function resolveNextRouterMode(files: readonly FrameworkContextFile[]): NextRouterMode {
  const hasAppRouter = files.some((file) => APP_ROUTE_PATTERN.test(file.path));
  const hasPagesRouter = files.some((file) => PAGES_ROUTE_PATTERN.test(file.path));

  if (hasAppRouter && hasPagesRouter) {
    return "mixed";
  }

  if (hasAppRouter) {
    return "app";
  }

  if (hasPagesRouter) {
    return "pages";
  }

  return "unknown";
}

function resolveCacheComponents(configFiles: readonly FrameworkContextFile[]): boolean | "unknown" {
  const states = collectBooleanOptionStates(configFiles, "cacheComponents");
  return states.size === 1 ? [...states][0] ?? "unknown" : "unknown";
}

function resolveNextRuntime(files: readonly FrameworkContextFile[]): NextRuntimeMode {
  const runtimes = new Set<NextRuntimeMode>();

  for (const file of files) {
    const runtime = readRuntimeExport(file.content ?? "");
    if (runtime !== undefined) {
      runtimes.add(runtime);
    }
  }

  if (runtimes.has("edge") && runtimes.has("node")) {
    return "mixed";
  }

  if (runtimes.has("edge")) {
    return "edge";
  }

  if (runtimes.has("node")) {
    return "node";
  }

  return "unknown";
}

function readRuntimeExport(source: string): "node" | "edge" | undefined {
  const match = findCodeMatch(
    source,
    /\bexport\s+const\s+runtime\s*=\s*["'](edge|nodejs)["']/,
  );
  if (match?.[1] === "edge") {
    return "edge";
  }

  if (match?.[1] === "nodejs") {
    return "node";
  }

  return undefined;
}

function hasEnabledOption(source: string, option: string): boolean {
  return hasExplicitBooleanOption(source, option, true)
    || findCodeMatch(source, new RegExp(`\\b${option}\\s*:\\s*\\{`)) !== undefined;
}

function hasExplicitBooleanOption(source: string, option: string, value: boolean): boolean {
  return findCodeMatch(
    source,
    new RegExp(`\\b${option}\\s*:\\s*${value ? "true" : "false"}\\b`),
  ) !== undefined;
}

function collectBooleanOptionStates(
  files: readonly FrameworkContextFile[],
  option: string,
): ReadonlySet<boolean> {
  const states = new Set<boolean>();

  for (const file of files) {
    if (hasExplicitBooleanOption(file.content ?? "", option, true)) {
      states.add(true);
    }
    if (hasExplicitBooleanOption(file.content ?? "", option, false)) {
      states.add(false);
    }
  }

  return states;
}

function uniqueDependencyVersion(
  dependencies: PackageDependencyMap,
  name: string,
): string | undefined {
  const versions = dependencies.get(name);
  return versions?.length === 1 ? versions[0] : undefined;
}

function parseMinimumVersion(version: string | undefined): FrameworkMinimumVersion | undefined {
  if (version === undefined || version.includes("||")) {
    return undefined;
  }

  const trimmed = version.trim();
  const simple = /^[~^]?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(trimmed);
  const lowerBound = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\s|$)/.exec(trimmed);
  const match = simple ?? lowerBound;
  if (match === null) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: toVersionNumber(match[2]),
    patch: toVersionNumber(match[3]),
  };
}

function toVersionNumber(value: string | undefined): number {
  return value === undefined || value === "x" || value === "*" ? 0 : Number(value);
}

function hasPackageImport(source: string, packageName: "next" | "react"): boolean {
  const packagePattern = `${packageName}(?:\\/[^"']+)?`;
  return findCodeMatch(
    source,
    new RegExp(`(?:^|\\n)\\s*(?:import(?:\\s+[^;\\n]+?\\s+from\\s+|\\s*)|export\\s+[^;\\n]+?\\s+from\\s+)["']${packagePattern}["']`),
  ) !== undefined;
}

function collectPackageRoots(files: readonly FrameworkContextFile[]): readonly string[] {
  return files
    .filter((file) => /(^|\/)package\.json$/.test(file.path))
    .map((file) => directoryName(file.path))
    .filter((root, index, roots) => roots.indexOf(root) === index)
    .sort((left, right) => left.localeCompare(right));
}

function findNearestPackageRoot(path: string, roots: readonly string[]): string | undefined {
  return roots
    .filter((root) => root === "" || path === root || path.startsWith(`${root}/`))
    .sort((left, right) => right.length - left.length || left.localeCompare(right))[0];
}

function directoryName(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
}

function relativeToRoot(path: string, root: string): string {
  return root === "" || path === root ? path : path.slice(root.length + 1);
}

function findCodeMatch(source: string, pattern: RegExp): RegExpExecArray | undefined {
  const codeMask = maskNonCode(source);
  const matcher = new RegExp(pattern.source, `${pattern.flags.replace(/g/g, "")}g`);
  let match = matcher.exec(source);

  while (match !== null) {
    const firstCodeCharacter = match[0].search(/\S/);
    if (
      firstCodeCharacter !== -1 &&
      codeMask[match.index + firstCodeCharacter] !== " "
    ) {
      return match;
    }
    match = matcher.exec(source);
  }

  return undefined;
}

function maskNonCode(source: string): string {
  type State = "code" | "single" | "double" | "template" | "line-comment" | "block-comment";
  let state: State = "code";
  let result = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const nextCharacter = source[index + 1];

    if (state === "code") {
      if (character === "/" && nextCharacter === "/") {
        result += "  ";
        state = "line-comment";
        index += 1;
      } else if (character === "/" && nextCharacter === "*") {
        result += "  ";
        state = "block-comment";
        index += 1;
      } else if (character === "'") {
        result += " ";
        state = "single";
      } else if (character === '"') {
        result += " ";
        state = "double";
      } else if (character === "`") {
        result += " ";
        state = "template";
      } else {
        result += character;
      }
      continue;
    }

    if (state === "line-comment") {
      result += character === "\n" ? "\n" : " ";
      if (character === "\n") {
        state = "code";
      }
      continue;
    }

    if (state === "block-comment") {
      if (character === "*" && nextCharacter === "/") {
        result += "  ";
        state = "code";
        index += 1;
      } else {
        result += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    result += character === "\n" ? "\n" : " ";
    if (character === "\\" && nextCharacter !== undefined) {
      result += nextCharacter === "\n" ? "\n" : " ";
      index += 1;
    } else if (
      (state === "single" && character === "'") ||
      (state === "double" && character === '"') ||
      (state === "template" && character === "`")
    ) {
      state = "code";
    }
  }

  return result;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}
