import type { ResolvedReviewConfiguration } from "../../config";
import type { ReviewFinding, ReviewResult } from "../../domain/review";
import type { EffectivePolicyContextV1 } from "../governance";
import type { PlatformRepositoryIdentity, PlatformReviewMode } from "../platform";
import {
  REVIEW_RUN_SCHEMA_VERSION,
  type PersistedFindingSnapshot,
  type PersistedPolicyContextV1,
  type ReviewRunSnapshot,
} from "./contracts";
import { createFindingIdentity } from "./finding-history";

export interface ReviewRunSnapshotInput {
  readonly runId: string;
  readonly repository?: PlatformRepositoryIdentity;
  readonly source?: {
    readonly reference?: string;
    readonly ref?: string;
    readonly commitSha?: string;
  };
  readonly configuration?: ResolvedReviewConfiguration;
  readonly policy?: EffectivePolicyContextV1;
  readonly execution: {
    readonly mode: PlatformReviewMode;
    readonly aiProvider?: string;
  };
  readonly startedAt: string;
}

export function createStartedReviewRunSnapshot(
  input: ReviewRunSnapshotInput,
): ReviewRunSnapshot {
  return {
    schemaVersion: REVIEW_RUN_SCHEMA_VERSION,
    runId: input.runId,
    state: "started",
    repository: input.repository,
    source: input.source ?? {},
    configuration: input.configuration,
    policy: input.policy === undefined ? undefined : toPersistedPolicyContext(input.policy),
    execution: input.execution,
    startedAt: input.startedAt,
  };
}

export function completeReviewRunSnapshot(
  started: ReviewRunSnapshot,
  result: ReviewResult,
  completedAt: string,
): ReviewRunSnapshot {
  return {
    ...started,
    state: "completed",
    completedAt,
    result: {
      score: result.score,
      decision: result.decision,
      stats: { ...result.stats },
      findings: result.findings.map(toPersistedFinding),
      warnings: result.warnings.map((warning) => ({ ...warning })),
      securityQualityGate: result.securityQualityGate,
      durationMs: result.durationMs,
    },
    failure: undefined,
  };
}

export function failReviewRunSnapshot(
  started: ReviewRunSnapshot,
  failure: { readonly code: string; readonly message: string },
  completedAt: string,
): ReviewRunSnapshot {
  return {
    ...started,
    state: "failed",
    completedAt,
    result: undefined,
    failure: { ...failure },
  };
}

export function toPersistedFinding(finding: ReviewFinding): PersistedFindingSnapshot {
  return {
    identity: createFindingIdentity(finding),
    ruleId: finding.ruleId,
    title: finding.title,
    message: finding.message,
    severity: finding.severity,
    source: finding.source,
    confidence: finding.confidence,
    location: finding.location === undefined ? undefined : { ...finding.location },
    suggestion: finding.suggestion,
  };
}

function toPersistedPolicyContext(policy: EffectivePolicyContextV1): PersistedPolicyContextV1 {
  return {
    schemaVersion: policy.schemaVersion,
    organizationId: policy.organizationId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    provenance: policy.provenance.map((entry) => ({ ...entry })),
  };
}
