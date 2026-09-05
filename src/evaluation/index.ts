export { matchFindings } from "./matcher";
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
  RealWorldWarningObservation,
} from "./real-world-observation";
export {
  countRealWorldExpectations,
  loadRealWorldEvaluationCorpus,
} from "./real-world";
export type {
  PublicPullRequestReference,
  RealWorldEvaluationCase,
  RealWorldExpectation,
  RealWorldExpectationKind,
  RealWorldMeasurementFidelity,
  RealWorldSeedDefinition,
} from "./real-world";
export { runEvaluationCase, runEvaluationSuite } from "./runner";
export type { EvaluationRunnerOptions } from "./runner";
export type * from "./contracts";
