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
  countRealWorldExpectations,
  loadRealWorldEvaluationCorpus,
} from "./real-world";
export type {
  PublicPullRequestReference,
  RealWorldEvaluationCase,
  RealWorldExpectation,
  RealWorldExpectationKind,
} from "./real-world";
export { runEvaluationCase, runEvaluationSuite } from "./runner";
export type { EvaluationRunnerOptions } from "./runner";
export type * from "./contracts";
