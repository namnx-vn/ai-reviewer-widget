export type OutcomeVerdict = "accepted" | "fixed" | "false-positive" | "missed-bug" | "ignored" | "duplicate" | "not-actionable" | "accepted-risk";
export interface EventIdentity { readonly eventId: string; readonly recordedAt: string }
export interface LearningReview extends EventIdentity {
  readonly repositoryId: string; readonly reviewRunId: string; readonly snapshotRef: string;
  readonly mode: "pull-request" | "repository"; readonly findingFingerprints: readonly string[];
}
export interface LearningOutcome extends EventIdentity {
  readonly repositoryId: string; readonly reviewRunId: string; readonly findingFingerprint: string;
  readonly ruleId: string; readonly verdict: OutcomeVerdict; readonly verified: boolean;
  readonly adjudicatorId?: string; readonly evidenceRef?: string; readonly supersedes?: readonly string[];
}
export interface ImprovementCandidate extends EventIdentity {
  readonly candidateId: string; readonly artifactDigest: string; readonly artifactRef: string;
  readonly parentVersion: number; readonly repositoryId: string; readonly outcomeRefs: readonly string[];
  readonly mandatoryControls: "preserved";
}
export interface RegressionVerification extends EventIdentity {
  readonly candidateId: string; readonly outcomeRef: string; readonly regressionRef: string;
  readonly adjudicatorId: string; readonly expectation: "must-find" | "must-not-find";
}
export interface EvaluationRequest {
  readonly candidateId: string; readonly artifactDigest: string; readonly baselineVersion: number;
  readonly evaluationRef: string; readonly datasetVersion: string; readonly policyVersion: string;
}
export interface PromotionQualityReceipt extends EvaluationRequest {
  readonly status: "pass" | "fail" | "insufficient-evidence"; readonly verified: boolean;
  readonly independentHoldout: boolean; readonly pendingLabels: number;
  readonly mandatoryControlsPreserved: boolean; readonly reasons: readonly string[];
}
export interface PromotionQualityPort { evaluate(request: EvaluationRequest): Promise<PromotionQualityReceipt> }
export interface CandidateEvaluation extends EventIdentity, PromotionQualityReceipt {}
export interface ShadowReview extends EventIdentity {
  readonly candidateId: string; readonly artifactDigest: string; readonly baselineVersion: number;
  readonly reviewRunId: string; readonly repositoryId: string; readonly durationMs: number;
  readonly productionFindingRefs: readonly string[]; readonly candidateFindingRefs: readonly string[];
}
export interface ProductionArtifact { readonly version: number; readonly candidateId: string; readonly artifactDigest: string }
export interface ReleaseAction extends EventIdentity {
  readonly productionVersion: number; readonly candidateId: string; readonly artifactDigest: string;
  readonly action: "promote" | "rollback"; readonly previousVersion: number;
  readonly actorId: string; readonly authorizationRef: string; readonly evaluationRef?: string;
}
export interface HumanAuthorization {
  readonly actorId: string; readonly authorizationRef: string;
}
export interface PromotionAuthorizationPort {
  authorize(request: HumanAuthorization & { readonly action: "promote" | "rollback"; readonly artifactDigest: string;
    readonly previousVersion: number }): Promise<boolean>;
}
export interface AdjudicationVerificationPort {
  verifyOutcome(input: LearningOutcome): Promise<boolean>;
  verifyRegression(input: RegressionVerification): Promise<boolean>;
}
export interface ShadowVerificationPort { verify(input: ShadowReview): Promise<boolean> }
export interface ProductionBaseline extends EventIdentity {
  readonly productionVersion: number; readonly candidateId: string; readonly artifactDigest: string;
}
export type LearningEvent =
  | ({ readonly version: 1; readonly kind: "baseline" } & ProductionBaseline)
  | ({ readonly version: 1; readonly kind: "review" } & LearningReview)
  | ({ readonly version: 1; readonly kind: "outcome" } & LearningOutcome)
  | ({ readonly version: 1; readonly kind: "candidate" } & ImprovementCandidate)
  | ({ readonly version: 1; readonly kind: "regression" } & RegressionVerification)
  | ({ readonly version: 1; readonly kind: "evaluation" } & CandidateEvaluation)
  | ({ readonly version: 1; readonly kind: "shadow" } & ShadowReview)
  | ({ readonly version: 1; readonly kind: "release" } & ReleaseAction);
export interface LearningStoreSnapshot { readonly revision: number; readonly events: readonly LearningEvent[] }
export interface LearningPersistencePort {
  read(): Promise<LearningStoreSnapshot>;
  append(event: LearningEvent, expectedRevision: number): Promise<void>;
}
export interface ResolvedOutcome {
  readonly repositoryId: string; readonly findingFingerprint: string; readonly ruleId: string;
  readonly state: "pending" | "verified"; readonly verdict: OutcomeVerdict;
  readonly outcomeRefs: readonly string[]; readonly evidenceRefs: readonly string[];
}
export interface FailureOpportunity {
  readonly repositoryId: string; readonly ruleId: string; readonly verdict: OutcomeVerdict;
  readonly sampleCount: number; readonly lowConfidence: boolean;
  readonly outcomeRefs: readonly string[]; readonly regressionRefs: readonly string[];
}
export interface LearningRuleMetrics {
  readonly repositoryId: string; readonly ruleId: string; readonly total: number; readonly verified: number; readonly pending: number;
  readonly truePositives: number; readonly falsePositives: number; readonly missedBugs: number;
  readonly duplicates: number; readonly notActionable: number; readonly ignored: number; readonly acceptedRisk: number;
  readonly precision: number | null; readonly recall: number | null;
}
