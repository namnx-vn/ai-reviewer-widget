import { readFileSync } from "node:fs";
import { createDefaultReviewUseCases } from "../src/application/review";
import { analyzeSemanticProgram } from "../src/analyzer";
import { buildCalibrationReport, buildObservationScorecard, buildRealWorldObservationReport, buildReliabilitySloReport,
  loadRealWorldEvaluationCorpus, parseAdversarialCorpus, runSemanticStabilityEvaluation } from "../src/evaluation";

const useCases = createDefaultReviewUseCases();
const corpus = loadRealWorldEvaluationCorpus();
const observation = buildRealWorldObservationReport(useCases, corpus);
const scorecard = buildObservationScorecard(observation, "phase-7-observation-v6", "phase-7-reviewer");
const calibration = buildCalibrationReport({ modelVersion: "unqualified-baseline", datasetVersion: "phase-7-observation-v6", binCount: 10,
  samples: observation.cases.flatMap((c) => c.findings.map((f) => ({ id: `${c.id}:${f.id}`, repositoryId: c.source.repository,
    ruleFamily: f.ruleId.split(".")[0], profile: "unknown", rawConfidence: f.confidence,
    detectionCertainty: f.source === "ai" ? null : f.confidence, calibratedProbability: null,
    label: c.qualityStatus === "invalid-fixture" ? "excluded" : f.adjudication?.verdict === "true-positive" ? "correct"
      : f.adjudication?.verdict === "false-positive" ? "incorrect" : "pending" }))) });
const adversarial = parseAdversarialCorpus(JSON.parse(readFileSync(new URL("../evaluation/fixtures/phase-7/adversarial.json", import.meta.url), "utf8")));
const semantic = runSemanticStabilityEvaluation(useCases, adversarial);
const observedAt = new Date().toISOString();
const operationalSamples = corpus.map((c) => {
  const start = performance.now();
  const first = useCases.reviewFiles(c.evaluationCase.files);
  const durationMs = performance.now() - start;
  const second = useCases.reviewFiles(c.evaluationCase.files);
  const identity = (result: typeof first) => JSON.stringify({ decision: result.decision, findings: result.findings, warnings: result.warnings });
  return { reviewId: c.evaluationCase.id, repositoryId: c.source.repository, observedAt,
    success: first.warnings.length === 0, durationMs, deterministicStable: identity(first) === identity(second) };
});
const slo = buildReliabilitySloReport({ reportVersion: "phase-7-execution-v1", datasetVersion: "phase-7-observation-v6",
  findingQualityStatus: "insufficient-evidence", policy: { version: "phase-7-slo-v1", minimumReviews: 100, minimumRepositories: 15,
    minimumSuccessRate: 0.999, maximumRuleCrashRate: 0, maximumP95DurationMs: 5000 }, samples: operationalSamples });
const report = { schemaVersion: 1, scorecard, calibration, semantic, slo,
  programIntelligence: adversarial.cases.map((c) => ({ caseId: c.id, summary: analyzeSemanticProgram(c.files) })),
  promotionEligibility: "insufficient-evidence", reasons: ["Inspected development corpus is not protected holdout",
    "Independent calibrated probabilities and sufficiently large source-backed cohorts remain required"] };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
// Guard maintained transformation stability. Known capability gaps and insufficient empirical qualification remain explicit in the report.
if (semantic.summary.semanticStability !== 1 || semantic.summary.unstableCases > 0) process.exitCode = 1;
