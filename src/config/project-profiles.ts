export const PROJECT_PROFILES = [
  "typescript-library",
  "react-application",
  "node-service",
  "nextjs-application",
  "micro-frontend",
  "monorepo",
  "security-sensitive",
  "performance-sensitive",
] as const;

export type ProjectProfileId = typeof PROJECT_PROFILES[number];

export interface ProjectProfileSignals {
  readonly files?: readonly string[];
  readonly dependencies?: readonly string[];
  readonly packageNames?: readonly string[];
  readonly packageCount?: number;
}

export interface ProjectProfileEvidence {
  readonly profile: ProjectProfileId;
  readonly reasons: readonly string[];
}

export interface ProjectProfileResolution {
  readonly version: 1;
  readonly mode: "auto" | "explicit";
  readonly profiles: readonly ProjectProfileId[];
  readonly evidence: readonly ProjectProfileEvidence[];
}

const PRECEDENCE: readonly ProjectProfileId[] = [
  "monorepo",
  "nextjs-application",
  "micro-frontend",
  "react-application",
  "node-service",
  "typescript-library",
  "security-sensitive",
  "performance-sensitive",
];

export function resolveProjectProfiles(
  selection: "auto" | readonly ProjectProfileId[],
  signals: ProjectProfileSignals = {},
): ProjectProfileResolution {
  if (selection !== "auto") {
    const profiles = orderProfiles(selection);
    return {
      version: 1,
      mode: "explicit",
      profiles,
      evidence: profiles.map((profile) => ({ profile, reasons: ["Selected explicitly by configuration."] })),
    };
  }

  const dependencies = new Set(signals.dependencies ?? []);
  const files = new Set(signals.files ?? []);
  const evidence = new Map<ProjectProfileId, string[]>();
  const add = (profile: ProjectProfileId, reason: string): void => {
    const reasons = evidence.get(profile) ?? [];
    reasons.push(reason);
    evidence.set(profile, reasons);
  };

  const packageCount = signals.packageCount ?? signals.packageNames?.length ?? 0;
  if (packageCount > 1 || hasWorkspaceFile(files)) add("monorepo", "Multiple package boundaries or workspace configuration detected.");
  if (dependencies.has("next") || hasAny(files, ["next.config.js", "next.config.mjs", "next.config.ts"])) {
    add("nextjs-application", "Next.js dependency or configuration detected.");
    add("react-application", "Next.js implies a React application runtime.");
  } else if (dependencies.has("react") || dependencies.has("react-dom")) {
    add("react-application", "React dependency detected.");
  }
  if (dependencies.has("@module-federation/runtime") || dependencies.has("@module-federation/enhanced") || hasFederationConfig(files)) {
    add("micro-frontend", "Module Federation dependency or configuration detected.");
  }
  if (dependencies.has("express") || dependencies.has("fastify") || dependencies.has("@nestjs/core")) {
    add("node-service", "Node service framework dependency detected.");
  }
  if (!evidence.has("react-application") && !evidence.has("node-service") && !evidence.has("nextjs-application") && hasTypeScriptConfig(files)) {
    add("typescript-library", "TypeScript project detected without an application framework signal.");
  }
  if (hasSecurityDependency(dependencies)) add("security-sensitive", "Security/authentication dependency detected.");
  if (hasPerformanceSignal(dependencies)) add("performance-sensitive", "Performance/observability dependency detected.");

  const profiles = orderProfiles([...evidence.keys()]);
  return {
    version: 1,
    mode: "auto",
    profiles,
    evidence: profiles.map((profile) => ({ profile, reasons: [...(evidence.get(profile) ?? [])] })),
  };
}

function orderProfiles(profiles: readonly ProjectProfileId[]): readonly ProjectProfileId[] {
  const unique = new Set(profiles);
  return PRECEDENCE.filter((profile) => unique.has(profile));
}

function hasAny(files: ReadonlySet<string>, names: readonly string[]): boolean {
  return names.some((name) => [...files].some((file) => file === name || file.endsWith(`/${name}`)));
}

function hasWorkspaceFile(files: ReadonlySet<string>): boolean {
  return hasAny(files, ["pnpm-workspace.yaml", "lerna.json", "nx.json"]);
}

function hasFederationConfig(files: ReadonlySet<string>): boolean {
  return [...files].some((file) => /(^|\/)(module-federation|federation)\.config\.(js|mjs|cjs|ts)$/.test(file));
}

function hasTypeScriptConfig(files: ReadonlySet<string>): boolean {
  return [...files].some((file) => /(^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(file));
}

function hasSecurityDependency(dependencies: ReadonlySet<string>): boolean {
  return ["passport", "jsonwebtoken", "jose", "bcrypt", "argon2"].some((name) => dependencies.has(name));
}

function hasPerformanceSignal(dependencies: ReadonlySet<string>): boolean {
  return ["@opentelemetry/api", "prom-client", "clinic"].some((name) => dependencies.has(name));
}
