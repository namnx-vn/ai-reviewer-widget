import type { Severity } from "../domain/review";
import {
  ConfigurationError,
  REVIEW_PROFILES,
  RULE_FAMILIES,
  type ConfigurationDiagnostic,
  type ResolvedReviewConfiguration,
  type ReviewProfileId,
  type RuleCatalog,
  type RuleFamilyId,
} from "./contracts";
import { deepFreeze, DEFAULT_REVIEW_CONFIGURATION } from "./defaults";
import {
  PROJECT_PROFILES,
  resolveProjectProfiles,
  type ProjectProfileId,
  type ProjectProfileResolution,
  type ProjectProfileSignals,
} from "./project-profiles";

const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low", "info"];
const SECURITY_PROFILES = [
  "security/default", "security/strict", "security/financial", "security/banking",
] as const;

const ROOT_FIELDS = ["version", "profile", "include", "exclude", "rules", "ai", "qualityGate"];
const RULE_FIELDS = ["disabledFamilies", "disabled", "severity"];
const AI_FIELDS = ["mode", "provider"];
const QUALITY_GATE_FIELDS = ["securityProfile"];

export function parseReviewConfiguration(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new ConfigurationError([{
      code: "CONFIG_INVALID_JSON",
      path: "$",
      message: ".ai-reviewer.json must contain valid JSON.",
    }]);
  }
}

export function resolveReviewConfiguration(
  input: unknown,
  catalog: RuleCatalog,
  projectSignals: ProjectProfileSignals = {},
): ResolvedReviewConfiguration {
  if (input === undefined) return DEFAULT_REVIEW_CONFIGURATION;

  const diagnostics: ConfigurationDiagnostic[] = [];
  if (!isRecord(input)) {
    throw invalid("$", "Configuration must be an object.");
  }
  unknownFields(input, ROOT_FIELDS, "$", diagnostics);
  if (input.version !== 1) diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", "version", "Expected schema version 1."));

  const profileSelection = resolveProfileSelection(input.profile, diagnostics, projectSignals);
  const profile = profileSelection.reviewProfile;
  const projectResolution = profileSelection.projectResolution;
  const preset = applyProjectProfilePreset(profilePreset(profile), projectResolution.profiles);
  const include = stringList(input.include, "include", diagnostics, DEFAULT_REVIEW_CONFIGURATION.include);
  const exclude = stringList(input.exclude, "exclude", diagnostics, DEFAULT_REVIEW_CONFIGURATION.exclude);
  const rules = recordSection(input.rules, "rules", RULE_FIELDS, diagnostics);
  const disabledFamilies = uniqueMembers(
    rules?.disabledFamilies,
    RULE_FAMILIES,
    "rules.disabledFamilies",
    diagnostics,
    preset.disabledFamilies,
  );
  const disabled = uniqueStrings(rules?.disabled, "rules.disabled", diagnostics, []);
  const knownRules = new Set(catalog.ruleIds);
  for (const ruleId of disabled) {
    if (!knownRules.has(ruleId)) diagnostics.push(diagnostic(
      "CONFIG_UNKNOWN_RULE", "rules.disabled", `Unknown rule ID "${ruleId}".`,
    ));
  }
  const severity = severityRecord(rules?.severity, knownRules, diagnostics, preset.severity);
  const ai = recordSection(input.ai, "ai", AI_FIELDS, diagnostics);
  const aiMode = member(ai?.mode ?? "enabled", ["disabled", "enabled"] as const, "ai.mode", diagnostics, "enabled");
  const provider = optionalNonEmptyString(ai?.provider, "ai.provider", diagnostics);
  const qualityGate = recordSection(input.qualityGate, "qualityGate", QUALITY_GATE_FIELDS, diagnostics);
  const securityProfile = member(
    qualityGate?.securityProfile ?? preset.securityProfile,
    SECURITY_PROFILES,
    "qualityGate.securityProfile",
    diagnostics,
    preset.securityProfile,
  );

  if (diagnostics.length > 0) throw new ConfigurationError(diagnostics);

  return deepFreeze({
    version: 1,
    profile,
    projectProfiles: [...projectResolution.profiles],
    projectProfileMode: profileSelection.mode,
    projectProfileEvidence: projectResolution.evidence.map((item) => ({
      profile: item.profile,
      reasons: [...item.reasons],
    })),
    include: [...include],
    exclude: [...exclude],
    rules: { disabledFamilies: [...disabledFamilies], disabled: [...disabled], severity: { ...severity } },
    ai: { mode: aiMode, ...(provider === undefined ? {} : { provider }) },
    qualityGate: { securityProfile },
  });
}

interface ProfilePreset {
  readonly disabledFamilies: readonly RuleFamilyId[];
  readonly securityProfile: typeof SECURITY_PROFILES[number];
  readonly severity: Readonly<Record<string, Severity>>;
}

function resolveProfileSelection(
  value: unknown,
  diagnostics: ConfigurationDiagnostic[],
  signals: ProjectProfileSignals,
): {
  readonly reviewProfile: ReviewProfileId;
  readonly projectResolution: ProjectProfileResolution;
  readonly mode: "auto" | "explicit" | "legacy";
} {
  if (value === undefined || isMember(value, REVIEW_PROFILES)) {
    return {
      reviewProfile: value === undefined ? "default" : value,
      projectResolution: { version: 1, mode: "explicit", profiles: [], evidence: [] },
      mode: "legacy",
    };
  }
  if (value === "auto") {
    return {
      reviewProfile: "default",
      projectResolution: resolveProjectProfiles("auto", signals),
      mode: "auto",
    };
  }
  if (Array.isArray(value)) {
    const profiles: ProjectProfileId[] = [];
    for (const item of value) {
      if (!isMember(item, PROJECT_PROFILES)) {
        diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", "profile", `Unsupported project profile "${String(item)}".`));
      } else {
        profiles.push(item);
      }
    }
    if (new Set(profiles).size !== profiles.length) {
      diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", "profile", "Project profiles must be unique."));
    }
    return {
      reviewProfile: "default",
      projectResolution: resolveProjectProfiles(profiles),
      mode: "explicit",
    };
  }
  diagnostics.push(diagnostic(
    "CONFIG_INVALID_VALUE",
    "profile",
    "Expected a review preset, \"auto\", or an array of supported project profiles.",
  ));
  return {
    reviewProfile: "default",
    projectResolution: { version: 1, mode: "explicit", profiles: [], evidence: [] },
    mode: "legacy",
  };
}

function applyProjectProfilePreset(base: ProfilePreset, profiles: readonly ProjectProfileId[]): ProfilePreset {
  const securitySensitive = profiles.includes("security-sensitive");
  const performanceSensitive = profiles.includes("performance-sensitive");
  return {
    disabledFamilies: base.disabledFamilies,
    securityProfile: securitySensitive ? "security/strict" : base.securityProfile,
    severity: performanceSensitive
      ? { ...base.severity, "performance.large-component": "high" }
      : base.severity,
  };
}

function profilePreset(profile: ReviewProfileId): ProfilePreset {
  switch (profile) {
    case "strict": return {
      disabledFamilies: [], securityProfile: "security/strict", severity: { "quality.no-console": "medium" },
    };
    case "security-focused": return {
      disabledFamilies: [], securityProfile: "security/strict", severity: {},
    };
    case "performance-focused": return {
      disabledFamilies: [], securityProfile: "security/default", severity: { "performance.large-component": "high" },
    };
    case "default": return { disabledFamilies: [], securityProfile: "security/default", severity: {} };
  }
}

function recordSection(
  value: unknown,
  path: string,
  fields: readonly string[],
  diagnostics: ConfigurationDiagnostic[],
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, "Expected an object."));
    return undefined;
  }
  unknownFields(value, fields, path, diagnostics);
  return value;
}

function severityRecord(
  value: unknown,
  knownRules: ReadonlySet<string>,
  diagnostics: ConfigurationDiagnostic[],
  fallback: Readonly<Record<string, Severity>>,
): Readonly<Record<string, Severity>> {
  if (value === undefined) return fallback;
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", "rules.severity", "Expected an object."));
    return fallback;
  }
  const result: Record<string, Severity> = { ...fallback };
  for (const [ruleId, severity] of Object.entries(value)) {
    if (!knownRules.has(ruleId)) {
      diagnostics.push(diagnostic("CONFIG_UNKNOWN_RULE", `rules.severity.${ruleId}`, `Unknown rule ID "${ruleId}".`));
    } else if (!isMember(severity, SEVERITIES)) {
      diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", `rules.severity.${ruleId}`, "Expected a valid severity."));
    } else {
      result[ruleId] = severity;
    }
  }
  return result;
}

function stringList(
  value: unknown,
  path: string,
  diagnostics: ConfigurationDiagnostic[],
  fallback: readonly string[],
): readonly string[] {
  return uniqueStrings(value, path, diagnostics, fallback);
}

function uniqueStrings(
  value: unknown,
  path: string,
  diagnostics: ConfigurationDiagnostic[],
  fallback: readonly string[],
): readonly string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, "Expected an array of non-empty strings."));
    return fallback;
  }
  const normalized = value.map((item) => item.trim());
  if (new Set(normalized).size !== normalized.length) {
    diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, "Values must be unique."));
  }
  return normalized;
}

function uniqueMembers<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  diagnostics: ConfigurationDiagnostic[],
  fallback: readonly T[],
): readonly T[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, "Expected an array."));
    return fallback;
  }
  const result: T[] = [];
  for (const item of value) {
    if (!isMember(item, allowed)) diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, `Unsupported value "${String(item)}".`));
    else result.push(item);
  }
  if (new Set(result).size !== result.length) diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, "Values must be unique."));
  return result;
}

function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  diagnostics: ConfigurationDiagnostic[],
  fallback: T,
): T {
  if (isMember(value, allowed)) return value;
  diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, `Unsupported value "${String(value)}".`));
  return fallback;
}

function isMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.some((item) => item === value);
}

function optionalNonEmptyString(value: unknown, path: string, diagnostics: ConfigurationDiagnostic[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push(diagnostic("CONFIG_INVALID_VALUE", path, "Expected a non-empty string."));
    return undefined;
  }
  return value.trim();
}

function unknownFields(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
  diagnostics: ConfigurationDiagnostic[],
): void {
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) diagnostics.push(diagnostic(
      "CONFIG_UNKNOWN_FIELD", path === "$" ? field : `${path}.${field}`, "Unknown configuration field.",
    ));
  }
}

function invalid(path: string, message: string): ConfigurationError {
  return new ConfigurationError([diagnostic("CONFIG_INVALID_VALUE", path, message)]);
}

function diagnostic(
  code: ConfigurationDiagnostic["code"], path: string, message: string,
): ConfigurationDiagnostic {
  return { code, path, message };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
