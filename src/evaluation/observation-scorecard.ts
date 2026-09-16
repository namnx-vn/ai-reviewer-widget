import type { Severity } from "../domain/review";
import type { RealWorldCaseObservation, RealWorldObservationReport } from "./real-world-observation";
import { findRealWorldRuleMapping } from "./real-world-rule-mapping";
import { buildReliabilityScorecard, type ScorecardDimensions, type ScorecardInput } from "./scorecard";

function dimensions(item: RealWorldCaseObservation, ruleId: string, severity: Severity,
  provenance: "deterministic" | "ai" = "deterministic"): ScorecardDimensions {
  return { ruleId, ruleFamily: ruleId.split(".")[0], severity, provenance, language: "unknown",
    framework: "unknown", profile: "unknown", repositoryCategory: item.category, changeScope: "minimized-fixture",
    findingScope: "repository-context", cohort: item.cohort };
}

/** Diagnostic adapter for the inspected cohort. No retroactive holdout or calibration claims. */
export function buildObservationScorecard(observation: RealWorldObservationReport, datasetVersion: string, reviewerVersion: string) {
  const input: ScorecardInput = {
    datasetVersion, reviewerVersion,
    findings: observation.cases.flatMap((item) => item.findings.map((finding) => ({
      id: `${item.id}:${finding.id}`, caseId: item.id, repositoryId: item.source.repository,
      dimensions: dimensions(item, finding.ruleId, finding.severity, finding.source === "ai" ? "ai" : "deterministic"),
      verdict: item.qualityStatus === "invalid-fixture" ? "invalid-fixture" as const : finding.adjudication?.verdict ?? "pending",
    }))),
    expectations: observation.cases.flatMap((item) => item.expectations.filter((e) => e.kind === "must-find").map((expectation) => {
      const mapping = findRealWorldRuleMapping(item.id, expectation.id);
      return { id: `${item.id}:${expectation.id}`, caseId: item.id, repositoryId: item.source.repository,
        dimensions: dimensions(item, mapping?.acceptableRuleIds[0] ?? `unmapped.${expectation.id}`, expectation.severity ?? "info"),
        qualityStatus: item.qualityStatus,
        detected: mapping !== undefined && mapping.acceptableRuleIds.some((id) => item.findings.some((f) => f.ruleId === id)),
      };
    })),
    // Negative controls have a case denominator and are kept separate from emitted-finding precision.
    negativeControls: observation.cases.filter((item) => item.measurementFidelity === "empirical"
      && item.expectations.some((e) => e.kind === "must-not-find") && !item.expectations.some((e) => e.kind === "must-find"))
      .map((item) => ({ id: `${item.id}:negative-control`, caseId: item.id, repositoryId: item.source.repository,
        dimensions: dimensions(item, "control.case", "info"), qualityStatus: item.qualityStatus, violation: item.findings.length > 0 })),
    executions: observation.cases.map((item) => ({ caseId: item.id, success: item.warnings.length === 0,
      fallback: null, stable: item.stable, runtimeMs: null, memoryBytes: null, aiRequests: null, aiCost: null })),
  };
  return { schemaVersion: 1, corpusQualityStatus: observation.summary.qualityStatus,
    scorecard: buildReliabilityScorecard(input), promotionEligibility: "insufficient-evidence" as const,
    reasons: ["Inspected minimized development fixtures are not unseen protected repository evidence."] };
}
