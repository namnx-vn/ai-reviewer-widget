import {
  resolveFrameworkContext,
  type FrameworkContext,
  type FrameworkContextFile,
} from "../react/semantic";

const DEFAULT_MAXIMUM_CONTEXTS = 8;

export interface VerifiedFrameworkContextInput {
  readonly files: readonly FrameworkContextFile[];
  readonly changedPaths: readonly string[];
  readonly maximumContexts?: number;
}

interface NormalizedFrameworkContext {
  readonly react: {
    readonly detected: boolean;
    readonly version: string;
    readonly minimumVersion: FrameworkContext["react"]["minimumVersion"] | "unknown";
    readonly compiler: "enabled" | "disabled" | "unknown";
  };
  readonly nextjs: {
    readonly detected: boolean;
    readonly version: string;
    readonly minimumVersion: NonNullable<FrameworkContext["nextjs"]>["minimumVersion"] | "unknown";
    readonly router: "app" | "pages" | "mixed" | "unknown";
    readonly cacheComponents: boolean | "unknown";
    readonly runtime: "node" | "edge" | "mixed" | "unknown";
  };
}

interface GroupedFrameworkContext {
  readonly targets: readonly string[];
  readonly framework: NormalizedFrameworkContext;
}

/**
 * Produces a small deterministic prompt block. Framework discovery stays outside
 * the model and unresolved facts are represented explicitly instead of omitted.
 */
export function buildVerifiedFrameworkContextBlock(
  input: VerifiedFrameworkContextInput,
): string {
  const maximumContexts = input.maximumContexts ?? DEFAULT_MAXIMUM_CONTEXTS;
  if (!Number.isSafeInteger(maximumContexts) || maximumContexts < 1) {
    throw new Error("Framework context maximumContexts must be a positive integer.");
  }

  const targets = [...new Set(input.changedPaths.map(normalizePath))].sort();
  const grouped = groupContexts(input.files, targets);
  const contexts = grouped.slice(0, maximumContexts);
  const payload = {
    schemaVersion: "1",
    authority: "deterministic-repository-evidence",
    contexts,
    omittedContexts: Math.max(0, grouped.length - contexts.length),
  } as const;

  return [
    "VERIFIED FRAMEWORK CONTEXT (schema v1; unknown facts must remain unknown):",
    JSON.stringify(payload),
  ].join("\n");
}

function groupContexts(
  files: readonly FrameworkContextFile[],
  targets: readonly string[],
): readonly GroupedFrameworkContext[] {
  const groups = new Map<string, { targets: string[]; framework: NormalizedFrameworkContext }>();

  for (const targetFile of targets) {
    const framework = normalizeFrameworkContext(resolveForTarget(files, targetFile));
    const key = JSON.stringify(framework);
    const existing = groups.get(key);
    groups.set(key, existing === undefined
      ? { targets: [targetFile], framework }
      : { targets: [...existing.targets, targetFile], framework });
  }

  return [...groups.values()].map((group) => ({
    targets: group.targets,
    framework: group.framework,
  }));
}

function resolveForTarget(
  files: readonly FrameworkContextFile[],
  targetFile: string,
): FrameworkContext {
  const input: {
    readonly files: readonly FrameworkContextFile[];
    readonly targetFile: string;
  } = { files, targetFile };
  return resolveFrameworkContext(input);
}

function normalizeFrameworkContext(context: FrameworkContext): NormalizedFrameworkContext {
  return {
    react: {
      detected: context.react.detected,
      version: context.react.version ?? "unknown",
      minimumVersion: context.react.minimumVersion ?? "unknown",
      compiler: context.react.compiler,
    },
    nextjs: {
      detected: context.nextjs !== undefined,
      version: context.nextjs?.version ?? "unknown",
      minimumVersion: context.nextjs?.minimumVersion ?? "unknown",
      router: context.nextjs?.router ?? "unknown",
      cacheComponents: context.nextjs?.cacheComponents ?? "unknown",
      runtime: context.nextjs?.runtime ?? "unknown",
    },
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}
