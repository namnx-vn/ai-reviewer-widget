import { createDefaultReviewUseCases } from "../src/application/review";
import {
  buildRealWorldObservationReport,
  serializeRealWorldObservationReport,
} from "../src/evaluation/real-world-observation";
import { loadRealWorldEvaluationCorpus } from "../src/evaluation/real-world";

const report = buildRealWorldObservationReport(
  createDefaultReviewUseCases(),
  loadRealWorldEvaluationCorpus(),
);

process.stdout.write(`${serializeRealWorldObservationReport(report)}\n`);
