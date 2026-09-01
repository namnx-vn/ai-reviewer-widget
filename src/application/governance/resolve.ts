import type {
  ConfigurationSecurityProfileId,
  ResolvedReviewConfiguration,
} from "../../config";
import type { Severity } from "../../domain/review";
import type {
  EffectivePolicyContextV1,
  InvocationPolicyOverrides,
  OrganizationPolicyResolutionInput,
  PolicyProvenanceEntry,
} from "./contracts";
import { POLICY_PROVENANCE_SCHEMA_VERSION } from "./contracts";

export type GovernancePolicyErrorCode =
  | "GOVERNANCE_OVERRIDE_FORBIDDEN"
  | "GOVERNANCE_REQUIRED_FAMILY_DISABLED"
  | "GOVERNANCE_RULE_DISABLE_FORBIDDEN"
  | "GOVERNANCE_SEVERITY_TOO_LOW"
  | "GOVERNANCE_AI_MODE_FORBIDDEN"
  | "GOVERNANCE_AI_PROVIDER_FORBIDDEN"
  | "GOVERNANCE_QUALITY_GATE_TOO_WEAK";

export class GovernancePolicyError extends Error {
  constructor(
    readonly code: GovernancePolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GovernancePolicyError";
  }
}

export function resolveOrganizationPolicy(
  input: OrganizationPolicyResolutionInput,
): EffectivePolicyContextV1 {
  const provenance: PolicyProvenanceEntry[] = [{
    path: "$",
    source: "built-in",
    reason: "Started from the built-in resolved review configuration.",
  }];
  let effective = cloneConfiguration(input.builtInConfiguration);

  if (input.policy.defaultProfile !== undefined) {
    effective = { ...effective, profile: input.policy.defaultProfile };
    provenance.push({
      path: "profile",
      source: "organization",
      reason: `Organization default profile ${input.policy.defaultProfile} applied.`,
    });
  }

  if (input.repositoryConfiguration !== undefined) {
    assertRepositoryOverridePermissions(effective, input.repositoryConfiguration, input.policy.overrides);
    effective = cloneConfiguration(input.repositoryConfiguration);
    provenance.push({
      path: "$",
      source: "repository",
      reason: "Allowed repository configuration applied before mandatory organization constraints.",
    });
  }

  effective = applyInvocationOverrides(effective, input.invocationOverrides, input.policy.overrides, provenance);
  assertOrganizationConstraints(effective, input);
  effective = enforceOrganizationConstraints(effective, input, provenance);

  return {
    schemaVersion: POLICY_PROVENANCE_SCHEMA_VERSION,
    organizationId: input.organization.id,
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    effectiveConfiguration: freezeConfiguration(effective),
    provenance: Object.freeze(provenance.map((entry) => Object.freeze({ ...entry }))),
  };
}

function assertRepositoryOverridePermissions(
  organizationBase: ResolvedReviewConfiguration,
  repository: ResolvedReviewConfiguration,
  permissions: OrganizationPolicyResolutionInput["policy"]["overrides"],
): void {
  if (!permissions.profile && repository.profile !== organizationBase.profile) {
    throwOverrideForbidden("repository", "profile");
  }
  if (!permissions.ruleFamilies && !sameStrings(repository.rules.disabledFamilies, organizationBase.rules.disabledFamilies)) {
    throwOverrideForbidden("repository", "rules.disabledFamilies");
  }
  if (!permissions.rules && !sameStrings(repository.rules.disabled, organizationBase.rules.disabled)) {
    throwOverrideForbidden("repository", "rules.disabled");
  }
  if (!permissions.severity && !sameRecord(repository.rules.severity, organizationBase.rules.severity)) {
    throwOverrideForbidden("repository", "rules.severity");
  }
  if (!permissions.aiMode && repository.ai.mode !== organizationBase.ai.mode) {
    throwOverrideForbidden("repository", "ai.mode");
  }
  if (!permissions.aiProvider && repository.ai.provider !== organizationBase.ai.provider) {
    throwOverrideForbidden("repository", "ai.provider");
  }
  if (
    !permissions.qualityGate
    && repository.qualityGate.securityProfile !== organizationBase.qualityGate.securityProfile
  ) {
    throwOverrideForbidden("repository", "qualityGate.securityProfile");
  }
}

function applyInvocationOverrides(
  configuration: ResolvedReviewConfiguration,
  overrides: InvocationPolicyOverrides | undefined,
  permissions: OrganizationPolicyResolutionInput["policy"]["overrides"],
  provenance: PolicyProvenanceEntry[],
): ResolvedReviewConfiguration {
  if (overrides === undefined) return configuration;
  let next = configuration;

  if (overrides.profile !== undefined) {
    requirePermission(permissions.profile, "profile");
    next = { ...next, profile: overrides.profile };
    provenance.push({ path: "profile", source: "invocation", reason: "Allowed invocation profile override applied." });
  }
  if (overrides.disabledFamilies !== undefined) {
    requirePermission(permissions.ruleFamilies, "rules.disabledFamilies");
    next = { ...next, rules: { ...next.rules, disabledFamilies: [...overrides.disabledFamilies] } };
    provenance.push({ path: "rules.disabledFamilies", source: "invocation", reason: "Allowed invocation rule-family override applied." });
  }
  if (overrides.disabledRules !== undefined) {
    requirePermission(permissions.rules, "rules.disabled");
    next = { ...next, rules: { ...next.rules, disabled: [...overrides.disabledRules] } };
    provenance.push({ path: "rules.disabled", source: "invocation", reason: "Allowed invocation rule override applied." });
  }
  if (overrides.severity !== undefined) {
    requirePermission(permissions.severity, "rules.severity");
    next = { ...next, rules: { ...next.rules, severity: { ...next.rules.severity, ...overrides.severity } } };
    provenance.push({ path: "rules.severity", source: "invocation", reason: "Allowed invocation severity override applied." });
  }
  if (overrides.aiMode !== undefined) {
    requirePermission(permissions.aiMode, "ai.mode");
    next = { ...next, ai: { ...next.ai, mode: overrides.aiMode } };
    provenance.push({ path: "ai.mode", source: "invocation", reason: "Allowed invocation AI mode override applied." });
  }
  if (overrides.aiProvider !== undefined) {
    requirePermission(permissions.aiProvider, "ai.provider");
    next = { ...next, ai: { ...next.ai, provider: overrides.aiProvider } };
    provenance.push({ path: "ai.provider", source: "invocation", reason: "Allowed invocation AI provider override applied." });
  }
  if (overrides.securityProfile !== undefined) {
    requirePermission(permissions.qualityGate, "qualityGate.securityProfile");
    next = { ...next, qualityGate: { securityProfile: overrides.securityProfile } };
    provenance.push({ path: "qualityGate.securityProfile", source: "invocation", reason: "Allowed invocation quality-gate override applied." });
  }

  return next;
}

function assertOrganizationConstraints(
  configuration: ResolvedReviewConfiguration,
  input: OrganizationPolicyResolutionInput,
): void {
  for (const family of input.policy.requiredRuleFamilies ?? []) {
    if (configuration.rules.disabledFamilies.includes(family)) {
      throw new GovernancePolicyError(
        "GOVERNANCE_REQUIRED_FAMILY_DISABLED",
        `Organization policy requires rule family "${family}".`,
      );
    }
  }
  for (const ruleId of input.policy.forbiddenDisabledRuleIds ?? []) {
    if (configuration.rules.disabled.includes(ruleId)) {
      throw new GovernancePolicyError(
        "GOVERNANCE_RULE_DISABLE_FORBIDDEN",
        `Organization policy forbids disabling rule "${ruleId}".`,
      );
    }
  }
  for (const [ruleId, minimum] of Object.entries(input.policy.minimumSeverity ?? {})) {
    const actual = configuration.rules.severity[ruleId];
    if (actual !== undefined && severityRank(actual) < severityRank(minimum)) {
      throw new GovernancePolicyError(
        "GOVERNANCE_SEVERITY_TOO_LOW",
        `Severity for "${ruleId}" cannot be weaker than ${minimum}.`,
      );
    }
  }
  const allowedModes = input.policy.ai?.allowedModes;
  if (allowedModes !== undefined && !allowedModes.includes(configuration.ai.mode)) {
    throw new GovernancePolicyError(
      "GOVERNANCE_AI_MODE_FORBIDDEN",
      `AI mode "${configuration.ai.mode}" is not allowed by organization policy.`,
    );
  }
  const allowedProviders = input.policy.ai?.allowedProviders;
  if (
    allowedProviders !== undefined
    && configuration.ai.provider !== undefined
    && !allowedProviders.includes(configuration.ai.provider)
  ) {
    throw new GovernancePolicyError(
      "GOVERNANCE_AI_PROVIDER_FORBIDDEN",
      `AI provider "${configuration.ai.provider}" is not allowed by organization policy.`,
    );
  }
  const minimumSecurityProfile = input.policy.qualityGate?.minimumSecurityProfile;
  if (
    input.policy.qualityGate?.mandatory
    && minimumSecurityProfile !== undefined
    && securityProfileRank(configuration.qualityGate.securityProfile) < securityProfileRank(minimumSecurityProfile)
  ) {
    throw new GovernancePolicyError(
      "GOVERNANCE_QUALITY_GATE_TOO_WEAK",
      `Security quality gate cannot be weaker than ${minimumSecurityProfile}.`,
    );
  }
}

function enforceOrganizationConstraints(
  configuration: ResolvedReviewConfiguration,
  input: OrganizationPolicyResolutionInput,
  provenance: PolicyProvenanceEntry[],
): ResolvedReviewConfiguration {
  let next = configuration;
  const minimumSeverity = input.policy.minimumSeverity ?? {};
  if (Object.keys(minimumSeverity).length > 0) {
    next = {
      ...next,
      rules: { ...next.rules, severity: { ...minimumSeverity, ...next.rules.severity } },
    };
    provenance.push({
      path: "rules.severity",
      source: "organization-enforced",
      reason: "Organization minimum severities are retained in the effective configuration.",
    });
  }
  if (input.policy.qualityGate?.mandatory && input.policy.qualityGate.minimumSecurityProfile !== undefined) {
    next = {
      ...next,
      qualityGate: { securityProfile: strongerSecurityProfile(
        next.qualityGate.securityProfile,
        input.policy.qualityGate.minimumSecurityProfile,
      ) },
    };
    provenance.push({
      path: "qualityGate.securityProfile",
      source: "organization-enforced",
      reason: "Mandatory organization security gate is preserved.",
    });
  }
  return next;
}

function requirePermission(allowed: boolean, path: string): void {
  if (!allowed) throwOverrideForbidden("invocation", path);
}

function throwOverrideForbidden(source: "repository" | "invocation", path: string): never {
  throw new GovernancePolicyError(
    "GOVERNANCE_OVERRIDE_FORBIDDEN",
    `Organization policy does not allow ${source} override for ${path}.`,
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameRecord(
  left: Readonly<Record<string, Severity>>,
  right: Readonly<Record<string, Severity>>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value]) => right[key] === value);
}

function severityRank(value: Severity): number {
  return ({ info: 0, low: 1, medium: 2, high: 3, critical: 4 })[value];
}

function securityProfileRank(value: ConfigurationSecurityProfileId): number {
  return ({
    "security/default": 0,
    "security/strict": 1,
    "security/financial": 2,
    "security/banking": 3,
  })[value];
}

function strongerSecurityProfile(
  left: ConfigurationSecurityProfileId,
  right: ConfigurationSecurityProfileId,
): ConfigurationSecurityProfileId {
  return securityProfileRank(left) >= securityProfileRank(right) ? left : right;
}

function cloneConfiguration(configuration: ResolvedReviewConfiguration): ResolvedReviewConfiguration {
  return {
    ...configuration,
    include: [...configuration.include],
    exclude: [...configuration.exclude],
    rules: {
      disabledFamilies: [...configuration.rules.disabledFamilies],
      disabled: [...configuration.rules.disabled],
      severity: { ...configuration.rules.severity },
    },
    ai: { ...configuration.ai },
    qualityGate: { ...configuration.qualityGate },
  };
}

function freezeConfiguration(configuration: ResolvedReviewConfiguration): ResolvedReviewConfiguration {
  Object.freeze(configuration.include);
  Object.freeze(configuration.exclude);
  Object.freeze(configuration.rules.disabledFamilies);
  Object.freeze(configuration.rules.disabled);
  Object.freeze(configuration.rules.severity);
  Object.freeze(configuration.rules);
  Object.freeze(configuration.ai);
  Object.freeze(configuration.qualityGate);
  return Object.freeze(configuration);
}
