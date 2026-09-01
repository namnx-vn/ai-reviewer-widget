import { describe, expect, it, vi } from "vitest";

import { DEFAULT_REVIEW_CONFIGURATION } from "../../../config";
import type { ReviewResult } from "../../../domain/review";
import { createStartedReviewRunSnapshot } from "../../history";
import { PLATFORM_API_VERSION, type PlatformReviewService } from "../../platform";
import {
  ORGANIZATION_POLICY_SCHEMA_VERSION,
  createGovernedPlatformReviewService,
  GovernancePolicyError,
  resolveOrganizationPolicy,
  type GovernancePolicyErrorCode,
  type OrganizationPolicy,
} from "..";

const policy: OrganizationPolicy = {
  schemaVersion: ORGANIZATION_POLICY_SCHEMA_VERSION,
  policyId: "org-policy",
  policyVersion: "2026-09-01",
  defaultProfile: "strict",
  requiredRuleFamilies: ["security"],
  forbiddenDisabledRuleIds: ["security.no-eval"],
  minimumSeverity: { "security.no-eval": "high" },
  qualityGate: { mandatory: true, minimumSecurityProfile: "security/strict" },
  ai: { allowedModes: ["enabled"], allowedProviders: ["openai"] },
  overrides: {
    profile: true,
    ruleFamilies: false,
    rules: false,
    severity: true,
    aiMode: false,
    aiProvider: false,
    qualityGate: false,
  },
};

const result: ReviewResult = {
  score: 100,
  decision: "PASS",
  findings: [],
  stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  warnings: [],
  durationMs: 1,
};

describe("organization governance", () => {
  it("resolves built-in, organization, repository, and allowed invocation precedence with provenance", () => {
    const repositoryConfiguration = {
      ...DEFAULT_REVIEW_CONFIGURATION,
      profile: "default" as const,
      ai: { mode: "enabled" as const, provider: "openai" },
      qualityGate: { securityProfile: "security/strict" as const },
    };

    const context = resolveOrganizationPolicy({
      organization: { id: "org-1", provider: "github" },
      policy,
      builtInConfiguration: DEFAULT_REVIEW_CONFIGURATION,
      repositoryConfiguration,
      invocationOverrides: { profile: "security-focused", severity: { "security.no-eval": "critical" } },
    });

    expect(context.effectiveConfiguration.profile).toBe("security-focused");
    expect(context.effectiveConfiguration.rules.severity["security.no-eval"]).toBe("critical");
    expect(context.provenance.map((entry) => entry.source)).toEqual(expect.arrayContaining([
      "built-in",
      "repository",
      "invocation",
      "organization-enforced",
    ]));
  });

  it("rejects repository or invocation attempts that weaken mandatory controls", () => {
    expectPolicyError(() => resolveOrganizationPolicy({
      organization: { id: "org-1" },
      policy,
      builtInConfiguration: DEFAULT_REVIEW_CONFIGURATION,
      repositoryConfiguration: {
        ...DEFAULT_REVIEW_CONFIGURATION,
        rules: {
          ...DEFAULT_REVIEW_CONFIGURATION.rules,
          disabledFamilies: ["security"],
        },
        ai: { mode: "enabled", provider: "openai" },
        qualityGate: { securityProfile: "security/strict" },
      },
    }), "GOVERNANCE_REQUIRED_FAMILY_DISABLED");

    expectPolicyError(() => resolveOrganizationPolicy({
      organization: { id: "org-1" },
      policy,
      builtInConfiguration: {
        ...DEFAULT_REVIEW_CONFIGURATION,
        ai: { mode: "enabled", provider: "openai" },
        qualityGate: { securityProfile: "security/strict" },
      },
      invocationOverrides: { aiMode: "disabled" },
    }), "GOVERNANCE_OVERRIDE_FORBIDDEN");
  });

  it("rejects weak severity, forbidden providers, and weak security gates explicitly", () => {
    const base = {
      ...DEFAULT_REVIEW_CONFIGURATION,
      ai: { mode: "enabled" as const, provider: "openai" },
      qualityGate: { securityProfile: "security/strict" as const },
    };

    expectPolicyError(() => resolveOrganizationPolicy({
      organization: { id: "org-1" },
      policy,
      builtInConfiguration: base,
      repositoryConfiguration: {
        ...base,
        rules: { ...base.rules, severity: { "security.no-eval": "low" } },
      },
    }), "GOVERNANCE_SEVERITY_TOO_LOW");

    expectPolicyError(() => resolveOrganizationPolicy({
      organization: { id: "org-1" },
      policy,
      builtInConfiguration: base,
      repositoryConfiguration: { ...base, ai: { mode: "enabled", provider: "other" } },
    }), "GOVERNANCE_AI_PROVIDER_FORBIDDEN");

    expectPolicyError(() => resolveOrganizationPolicy({
      organization: { id: "org-1" },
      policy,
      builtInConfiguration: base,
      repositoryConfiguration: { ...base, qualityGate: { securityProfile: "security/default" } },
    }), "GOVERNANCE_QUALITY_GATE_TOO_WEAK");
  });

  it("feeds the effective configuration into the existing platform review service", async () => {
    const review = vi.fn(async (request: Parameters<PlatformReviewService["review"]>[0]) => ({
      version: PLATFORM_API_VERSION,
      repository: request.repository,
      correlationId: request.run?.correlationId,
      result,
    }));
    const service = createGovernedPlatformReviewService({
      platform: { review },
      policyProvider: { load: vi.fn(async () => policy) },
      builtInConfiguration: {
        ...DEFAULT_REVIEW_CONFIGURATION,
        ai: { mode: "enabled", provider: "openai" },
        qualityGate: { securityProfile: "security/strict" },
      },
    });

    const output = await service.review({
      organization: { id: "org-1", provider: "github" },
      request: {
        version: PLATFORM_API_VERSION,
        repository: { id: "repo-1", owner: "acme", name: "reviewer" },
        source: { kind: "inline", files: [] },
        review: { mode: "files" },
      },
      invocationOverrides: { profile: "strict" },
    });

    expect(review).toHaveBeenCalledOnce();
    expect(review.mock.calls[0]?.[0].configuration).toBe(output.policy.effectiveConfiguration);
    expect(output.response.result).toBe(result);
  });

  it("persists policy identity and provenance without duplicating effective configuration", () => {
    const context = resolveOrganizationPolicy({
      organization: { id: "org-1" },
      policy,
      builtInConfiguration: {
        ...DEFAULT_REVIEW_CONFIGURATION,
        ai: { mode: "enabled", provider: "openai" },
        qualityGate: { securityProfile: "security/strict" },
      },
    });
    const snapshot = createStartedReviewRunSnapshot({
      runId: "run-1",
      configuration: context.effectiveConfiguration,
      policy: context,
      execution: { mode: "files", aiProvider: "openai" },
      startedAt: "2026-09-01T00:00:00.000Z",
    });

    expect(snapshot.configuration).toEqual(context.effectiveConfiguration);
    expect(snapshot.policy).toEqual({
      schemaVersion: 1,
      organizationId: "org-1",
      policyId: "org-policy",
      policyVersion: "2026-09-01",
      provenance: context.provenance,
    });
    expect(snapshot.policy).not.toHaveProperty("effectiveConfiguration");
  });
});

function expectPolicyError(execute: () => unknown, code: GovernancePolicyErrorCode): void {
  try {
    execute();
    throw new Error(`Expected GovernancePolicyError with code ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(GovernancePolicyError);
    if (error instanceof GovernancePolicyError) {
      expect(error.code).toBe(code);
    }
  }
}
