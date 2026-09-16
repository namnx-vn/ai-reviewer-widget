export { matchFindings } from "./matcher";
export {
  findRealWorldFindingAdjudication,
  REAL_WORLD_FINDING_ADJUDICATIONS,
} from "./real-world-finding-adjudication";
export type {
  RealWorldFindingAdjudication,
  RealWorldFindingVerdict,
} from "./real-world-finding-adjudication";
export {
  calculateDuplicateRate,
  calculateEvaluationMetrics,
  calculateStability,
  summarizeMetrics,
} from "./metrics";
export { formatEvaluationReport, serializeEvaluationReport } from "./report";
export {
  countRealWorldCatalogByCategory,
  countRealWorldCatalogBySignal,
  REAL_WORLD_PR_CATALOG,
} from "./real-world-catalog";
export type {
  RealWorldCatalogCategory,
  RealWorldCatalogEntry,
  RealWorldCatalogMaturity,
  RealWorldCatalogSignal,
} from "./real-world-catalog";
export {
  buildRealWorldObservationReport,
  REAL_WORLD_OBSERVATION_SCHEMA_VERSION,
  serializeRealWorldObservationReport,
} from "./real-world-observation";
export type {
  RealWorldCaseObservation,
  RealWorldFindingObservation,
  RealWorldObservationReport,
  RealWorldObservationSummary,
  RealWorldPrecisionStatus,
  RealWorldPrecisionSummary,
  RealWorldRecallSummary,
  RealWorldWarningObservation,
} from "./real-world-observation";
export {
  findRealWorldRuleMapping,
  REAL_WORLD_RULE_MAPPINGS,
} from "./real-world-rule-mapping";
export type { RealWorldRuleMapping } from "./real-world-rule-mapping";
export {
  countRealWorldExpectations,
  loadRealWorldEvaluationCorpus,
} from "./real-world";
export type {
  PublicPullRequestReference,
  RealWorldEvaluationCohort,
  RealWorldEvaluationCase,
  RealWorldExpectation,
  RealWorldExpectationKind,
  RealWorldMeasurementFidelity,
  RealWorldSeedDefinition,
} from "./real-world";
export { runEvaluationCase, runEvaluationSuite } from "./runner";
export type { EvaluationRunnerOptions } from "./runner";
export type * from "./contracts";
export { assertCandidateHoldoutIsolation, validateHoldoutManifest } from "./holdout";
export type { CandidateTrainingExposure, HoldoutCase, HoldoutManifest } from "./holdout";
export { evaluatePromotionQuality, parsePromotionQualityInput, wilsonLowerBound } from "./quality-gates";
export type {
  PairedQualityCase,
  PromotionQualityInput,
  PromotionQualityPolicy,
  PromotionQualityResult,
  QualityCaseCounts,
} from "./quality-gates";
export { evaluatePullRequestReview, evaluateRepositoryReview, parsePullRequestReviewInput, parseRepositoryReviewInput } from "./repository-review";
export { buildReliabilityScorecard } from "./scorecard";
export type * from "./scorecard";
export { buildCalibrationReport, compareCalibrationReports } from "./calibration";
export type * from "./calibration";
export { fitEmpiricalCalibrator, predictEmpiricalProbability } from "./calibrator";
export type * from "./calibrator";
export { buildReliabilitySloReport, parseReliabilitySloInput } from "./reliability-slo";
export type * from "./reliability-slo";
export { applySemanticTransformation, parseAdversarialCorpus, runSemanticStabilityEvaluation } from "./semantic-stability";
export type * from "./semantic-stability";
export { runCandidateTournament } from "./tournament";
export type * from "./tournament";
export { buildObservationScorecard } from "./observation-scorecard";
export type { RepositorySnapshot, RepositoryReviewEvaluation, PullRequestEvaluationInput, PullRequestReviewEvaluation } from "./repository-review";
