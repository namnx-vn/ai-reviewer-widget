import type { ResolvedReviewConfiguration } from "../../config";
import type {
  ReviewFinding,
  ReviewResult,
  ReviewSecurityQualityGate,
  ReviewStats,
  ReviewWarning,
} from "../../domain/review";
import type { EffectivePolicyContextV1, PolicyProvenanceEntry } from "../governance";
import type { PlatformRepositoryIdentity, PlatformReviewMode } from "../platform";

export const REVIEW_RUN_SCHEMA_VERSION = 1 as const;

export type ReviewRunSchemaVersion = typeof REVIEW_RUN_SCHEMA_VERSION;
export type ReviewRunState = "started" | "completed" | "failed";

export interface ReviewRunSourceIdentity {
  readonly reference?: string;
  readonly ref?: string;
  readonly commitSha?: string;
}

export interface ReviewRunExecutionMetadata {
  readonly mode: PlatformReviewMode;
  readonly aiProvider?: string;
}

export interface PersistedPolicyContextV1 {
  readonly schemaVersion: EffectivePolicyContextV1["schemaVersion"];
  readonly organizationId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly provenance: readonly PolicyProvenanceEntry[];
}

export interface PersistedFindingSnapshot {
  readonly identity: string;
  readonly ruleId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: ReviewFinding["severity"];
  readonly source: ReviewFinding["source"];
  readonly confidence: number;
  readonly location?: {
    readonly file: string;
    readonly line?: number;
    readonly column?: number;
  };
  readonly suggestion?: string;
}

export interface PersistedReviewResultSnapshot {
  readonly score: number;
  readonly decision: ReviewResult["decision"];
  readonly stats: Readonly<ReviewStats>;
  readonly findings: readonly PersistedFindingSnapshot[];
  readonly warnings: readonly Readonly<ReviewWarning>[];
  readonly securityQualityGate?: ReviewSecurityQualityGate;
  readonly durationMs: number;
}

export interface ReviewRunSnapshotV1 {
  readonly schemaVersion: ReviewRunSchemaVersion;
  readonly runId: string;
  readonly state: ReviewRunState;
  readonly repository?: Readonly<PlatformRepositoryIdentity>;
  readonly source: Readonly<ReviewRunSourceIdentity>;
  readonly configuration?: ResolvedReviewConfiguration;
  readonly policy?: PersistedPolicyContextV1;
  readonly execution: Readonly<ReviewRunExecutionMetadata>;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly result?: PersistedReviewResultSnapshot;
  readonly failure?: {
    readonly code: string;
    readonly message: string;
  };
}

export type ReviewRunSnapshot = ReviewRunSnapshotV1;

export interface ReviewHistoryQuery {
  readonly repositoryId?: string;
  readonly owner?: string;
  readonly name?: string;
  readonly limit?: number;
}

export type HistoricalFindingState = "new" | "existing" | "resolved";

export interface HistoricalFindingMatch {
  readonly state: HistoricalFindingState;
  readonly identity: string;
  readonly current?: PersistedFindingSnapshot;
  readonly previous?: PersistedFindingSnapshot;
}
