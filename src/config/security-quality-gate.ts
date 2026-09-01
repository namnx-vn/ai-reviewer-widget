import type { SecurityProfileId } from "../analyzer/security/policies";
import type { SecurityQualityGateSuppression } from "../analyzer/security/quality-gate";

export interface PullRequestSecurityGateConfig {
  readonly profile: SecurityProfileId;
  readonly evaluatedAt: string;
  readonly baselineFindingIds: readonly string[];
  readonly suppressions: readonly SecurityQualityGateSuppression[];
}

const PROFILE_IDS: readonly SecurityProfileId[] = [
  "security/default",
  "security/strict",
  "security/financial",
  "security/banking",
];

export function createPullRequestSecurityGateConfig(
  environment: Readonly<Record<string, string | undefined>>,
  evaluatedAt: string,
  defaultProfile: SecurityProfileId = "security/banking",
): PullRequestSecurityGateConfig {
  const profileValue = environment.SECURITY_GATE_PROFILE?.trim() || defaultProfile;
  if (!isSecurityProfileId(profileValue)) {
    throw new Error(`Unsupported SECURITY_GATE_PROFILE: ${profileValue}`);
  }

  const baselineFindingIds = uniqueNonEmptyValues(
    environment.SECURITY_GATE_BASELINE_IDS?.split(",") ?? [],
    "SECURITY_GATE_BASELINE_IDS",
  );
  const suppressions = parseSuppressions(environment.SECURITY_GATE_SUPPRESSIONS_JSON);

  return { profile: profileValue, evaluatedAt, baselineFindingIds, suppressions };
}

function parseSuppressions(value: string | undefined): readonly SecurityQualityGateSuppression[] {
  if (value === undefined || value.trim().length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("SECURITY_GATE_SUPPRESSIONS_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("SECURITY_GATE_SUPPRESSIONS_JSON must be an array.");
  }

  return parsed.map((item, index) => validateSuppression(item, index));
}

function validateSuppression(value: unknown, index: number): SecurityQualityGateSuppression {
  if (!isRecord(value)) {
    throw new Error(`Security suppression at index ${index} must be an object.`);
  }
  const findingId = optionalNonEmptyString(value.findingId, `suppression ${index} findingId`);
  const ruleId = optionalNonEmptyString(value.ruleId, `suppression ${index} ruleId`);
  const reason = requiredNonEmptyString(value.reason, `suppression ${index} reason`);
  const owner = optionalNonEmptyString(value.owner, `suppression ${index} owner`);
  const expiresAt = optionalNonEmptyString(value.expiresAt, `suppression ${index} expiresAt`);
  if (findingId === undefined && ruleId === undefined) {
    throw new Error(`Security suppression at index ${index} requires findingId or ruleId.`);
  }
  return { findingId, ruleId, reason, owner, expiresAt };
}

function uniqueNonEmptyValues(values: readonly string[], label: string): readonly string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicate finding IDs.`);
  }
  return normalized;
}

function requiredNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requiredNonEmptyString(value, label);
}

function isSecurityProfileId(value: string): value is SecurityProfileId {
  return PROFILE_IDS.some((profileId) => profileId === value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
