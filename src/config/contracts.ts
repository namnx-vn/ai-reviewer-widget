import type { Severity } from "../domain/review";

export const REVIEW_PROFILES = [
  "default",
  "strict",
  "security-focused",
  "performance-focused",
] as const;

export type ReviewProfileId = typeof REVIEW_PROFILES[number];

export const RULE_FAMILIES = [
  "quality",
  "security",
  "performance",
  "architecture",
  "mfe",
  "react",
] as const;

export type RuleFamilyId = typeof RULE_FAMILIES[number];
export type AIReviewMode = "disabled" | "enabled";
export type ConfigurationSecurityProfileId =
  | "security/default"
  | "security/strict"
  | "security/financial"
  | "security/banking";

export interface RuleCatalog {
  readonly ruleIds: readonly string[];
}

export interface ResolvedReviewConfiguration {
  readonly version: 1;
  readonly profile: ReviewProfileId;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly rules: {
    readonly disabledFamilies: readonly RuleFamilyId[];
    readonly disabled: readonly string[];
    readonly severity: Readonly<Record<string, Severity>>;
  };
  readonly ai: {
    readonly mode: AIReviewMode;
    readonly provider?: string;
  };
  readonly qualityGate: {
    readonly securityProfile: ConfigurationSecurityProfileId;
  };
}

export interface ConfigurationDiagnostic {
  readonly code:
    | "CONFIG_INVALID_JSON"
    | "CONFIG_INVALID_VALUE"
    | "CONFIG_UNKNOWN_FIELD"
    | "CONFIG_UNKNOWN_RULE";
  readonly path: string;
  readonly message: string;
}

export class ConfigurationError extends Error {
  constructor(readonly diagnostics: readonly ConfigurationDiagnostic[]) {
    super(diagnostics.map(({ code, path, message }) => `[${code}] ${path}: ${message}`).join("\n"));
    this.name = "ConfigurationError";
  }
}
