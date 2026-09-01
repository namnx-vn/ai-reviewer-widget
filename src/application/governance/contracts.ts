import type {
  AIReviewMode,
  ConfigurationSecurityProfileId,
  ResolvedReviewConfiguration,
  ReviewProfileId,
  RuleFamilyId,
} from "../../config";
import type { Severity } from "../../domain/review";
import type { PlatformRepositoryIdentity } from "../platform";

export const ORGANIZATION_POLICY_SCHEMA_VERSION = 1 as const;
export const POLICY_PROVENANCE_SCHEMA_VERSION = 1 as const;

export interface OrganizationIdentity {
  readonly id: string;
  readonly provider?: string;
}

export interface RepositoryPolicyRegistration {
  readonly organization: OrganizationIdentity;
  readonly repository: PlatformRepositoryIdentity;
  readonly policyId: string;
}

export interface OrganizationPolicyV1 {
  readonly schemaVersion: typeof ORGANIZATION_POLICY_SCHEMA_VERSION;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly defaultProfile?: ReviewProfileId;
  readonly requiredRuleFamilies?: readonly RuleFamilyId[];
  readonly forbiddenDisabledRuleIds?: readonly string[];
  readonly minimumSeverity?: Readonly<Record<string, Severity>>;
  readonly qualityGate?: {
    readonly mandatory: boolean;
    readonly minimumSecurityProfile?: ConfigurationSecurityProfileId;
  };
  readonly ai?: {
    readonly allowedModes?: readonly AIReviewMode[];
    readonly allowedProviders?: readonly string[];
  };
  readonly overrides: {
    readonly profile: boolean;
    readonly ruleFamilies: boolean;
    readonly rules: boolean;
    readonly severity: boolean;
    readonly aiMode: boolean;
    readonly aiProvider: boolean;
    readonly qualityGate: boolean;
  };
}

export type OrganizationPolicy = OrganizationPolicyV1;

export interface InvocationPolicyOverrides {
  readonly profile?: ReviewProfileId;
  readonly disabledFamilies?: readonly RuleFamilyId[];
  readonly disabledRules?: readonly string[];
  readonly severity?: Readonly<Record<string, Severity>>;
  readonly aiMode?: AIReviewMode;
  readonly aiProvider?: string;
  readonly securityProfile?: ConfigurationSecurityProfileId;
}

export type PolicyValueSource = "built-in" | "organization" | "repository" | "invocation" | "organization-enforced";

export interface PolicyProvenanceEntry {
  readonly path: string;
  readonly source: PolicyValueSource;
  readonly reason: string;
}

export interface EffectivePolicyContextV1 {
  readonly schemaVersion: typeof POLICY_PROVENANCE_SCHEMA_VERSION;
  readonly organizationId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly effectiveConfiguration: ResolvedReviewConfiguration;
  readonly provenance: readonly PolicyProvenanceEntry[];
}

export interface OrganizationPolicyResolutionInput {
  readonly organization: OrganizationIdentity;
  readonly policy: OrganizationPolicy;
  readonly builtInConfiguration: ResolvedReviewConfiguration;
  readonly repositoryConfiguration?: ResolvedReviewConfiguration;
  readonly invocationOverrides?: InvocationPolicyOverrides;
}
