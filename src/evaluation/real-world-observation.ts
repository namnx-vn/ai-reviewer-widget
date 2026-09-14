import type { ReviewUseCases } from "../application/review";
import type { ReviewFinding, ReviewWarning, Severity } from "../domain/review";
import type {
  PublicPullRequestReference,
  RealWorldEvaluationCohort,
  RealWorldEvaluationCase,
  RealWorldExpectation,
  RealWorldMeasurementFidelity,
} from "./real-world";
import { findRealWorldFindingAdjudication } from "./real-world-finding-adjudication";
import { findRealWorldRuleMapping } from "./real-world-rule-mapping";

export const REAL_WORLD_OBSERVATION_SCHEMA_VERSION = 5 as const;

export interface RealWorldFindingObservation {
  readonly id: string;
  readonly ruleId: string;
  readonly title: string;
  readonly severity: Severity;
  readonly source: ReviewFinding["source"];
  readonly confidence: number;
  readonly location?: ReviewFinding["location"];
}

export interface RealWorldWarningObservation {
  readonly code: ReviewWarning["code"];
  readonly message: string;
}

export interface RealWorldCaseObservation {
  readonly id: string;
  readonly category: string;
  readonly source: PublicPullRequestReference;
  readonly expectations: readonly RealWorldExpectation[];
  readonly measurementFidelity: RealWorldMeasurementFidelity;
  readonly cohort: RealWorldEvaluationCohort;
  readonly findings: readonly RealWorldFindingObservation[];
  readonly warnings: readonly RealWorldWarningObservation[];
  readonly stable: boolean;
}

export interface RealWorldRecallSummary {
  readonly mustFindExpectations: number;
  readonly truePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly recall: number | null;
}

export type RealWorldPrecisionStatus =
  | "pending-finding-adjudication"
  | "partially-adjudicated"
  | "measured";

export interface RealWorldPrecisionSummary {
  readonly totalFindings: number;
  readonly adjudicatedFindingCount: number;
  readonly truePositiveFindingCount: number;
  readonly falsePositiveFindingCount: number;
  readonly findingsPendingAdjudication: number;
  readonly adjudicationCoverage: number;
  readonly status: RealWorldPrecisionStatus;
  readonly precision: number | null;
}

export interface RealWorldObservationSummary {
  readonly totalCases: number;
  readonly stableCases: number;
  readonly totalFindings: number;
  readonly mustFindExpectations: number;
  readonly mappedMustFindExpectations: number;
  readonly mappedMustFindDetected: number;
  readonly mappedMustFindRecall: number | null;
  readonly mustFindExpectationsPendingRuleMapping: number;
  readonly recallTruePositiveCount: number;
  readonly recallFalseNegativeCount: number;
  readonly adjudicatedRecall: number | null;
  readonly recallByCohort: Readonly<Record<RealWorldEvaluationCohort, RealWorldRecallSummary>>;
  readonly precisionStatus: RealWorldPrecisionStatus;
  readonly adjudicatedFindingCount: number;
  readonly truePositiveFindingCount: number;
  readonly falsePositiveFindingCount: number;
  readonly findingsPendingAdjudication: number;
  readonly findingAdjudicationCoverage: number;
  readonly precision: number | null;
  readonly precisionByCohort: Readonly<
    Record<RealWorldEvaluationCohort, RealWorldPrecisionSummary>
  >;
  readonly empiricalNegativeControls: number;
  readonly empiricalNegativeControlsWithFindings: number;
  readonly empiricalNegativeControlCaseFalsePositiveRate: number;
  readonly empiricalNegativeControlFindingCount: number;
  readonly empiricalNegativeControlMediumOrHigherFindingCount: number;
  readonly cleanControls: number;
  readonly syntheticCleanControls: number;
  readonly empiricalCleanControls: number;
  readonly empiricalCleanControlsWithFindings: number;
  readonly empiricalCleanControlCaseFalsePositiveRate: number;
  readonly empiricalCleanControlFindingCount: number;
  readonly empiricalCleanControlMediumOrHigherFindingCount: number;
  readonly allCleanControlsWithFindings: number;
  readonly allCleanControlFindingCount: number;
}

export interface RealWorldObservationReport {
  readonly schemaVersion: typeof REAL_WORLD_OBSERVATION_SCHEMA_VERSION;
  readonly summary: RealWorldObservationSummary;
  readonly cases: readonly RealWorldCaseObservation[];
}

const MEDIUM_OR_HIGHER: ReadonlySet<Severity> = new Set([
  "critical",
  "high",
  "medium",
]);

function findingIdentity(finding: ReviewFinding): string {
  return `${finding.ruleId}:${finding.id}`;
}

function observeFinding(finding: ReviewFinding): RealWorldFindingObservation {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    title: finding.title,
    severity: finding.severity,
    source: finding.source,
    confidence: finding.confidence,
    location: finding.location,
  };
}

function observeCase(
  reviewUseCases: ReviewUseCases,
  item: RealWorldEvaluationCase,
): RealWorldCaseObservation {
  const first = reviewUseCases.reviewFiles(item.evaluationCase.files);
  const second = reviewUseCases.reviewFiles(item.evaluationCase.files);
  const firstIdentities = first.findings.map(findingIdentity).sort();
  const secondIdentities = second.findings.map(findingIdentity).sort();

  return {
    id: item.evaluationCase.id,
    category: item.evaluationCase.category,
    source: item.source,
    expectations: item.expectations,
    measurementFidelity: item.measurementFidelity,
    cohort: item.cohort,
    findings: first.findings.map(observeFinding),
    warnings: first.warnings.map(({ code, message }) => ({ code, message })),
    stable: JSON.stringify(firstIdentities) === JSON.stringify(secondIdentities),
  };
}

function isMustFindDetected(
  item: RealWorldCaseObservation,
  expectation: RealWorldExpectation,
): boolean {
  const mapping = findRealWorldRuleMapping(item.id, expectation.id);
  return mapping !== undefined && mapping.acceptableRuleIds.some(
    (ruleId) => item.findings.some((finding) => finding.ruleId === ruleId),
  );
}

function isEmpiricalNegativeControl(item: RealWorldCaseObservation): boolean {
  return item.measurementFidelity === "empirical"
    && item.expectations.some(({ kind }) => kind === "must-not-find")
    && !item.expectations.some(({ kind }) => kind === "must-find");
}

function calculateMappedMustFind(
  cases: readonly RealWorldCaseObservation[],
): { readonly mapped: number; readonly detected: number } {
  let mapped = 0;
  let detected = 0;

  for (const item of cases) {
    for (const expectation of item.expectations) {
      if (expectation.kind !== "must-find") continue;
      const mapping = findRealWorldRuleMapping(item.id, expectation.id);
      if (mapping === undefined) continue;
      mapped += 1;
      if (isMustFindDetected(item, expectation)) {
        detected += 1;
      }
    }
  }

  return { mapped, detected };
}

function calculateRecall(
  cases: readonly RealWorldCaseObservation[],
): RealWorldRecallSummary {
  const mustFindExpectations = cases.flatMap(({ expectations }) =>
    expectations.filter(({ kind }) => kind === "must-find")
  );
  const truePositiveCount = cases.reduce(
    (total, item) => total + item.expectations.filter(
      (expectation) =>
        expectation.kind === "must-find" && isMustFindDetected(item, expectation),
    ).length,
    0,
  );
  const falseNegativeCount = mustFindExpectations.length - truePositiveCount;

  return {
    mustFindExpectations: mustFindExpectations.length,
    truePositiveCount,
    falseNegativeCount,
    recall: mustFindExpectations.length === 0
      ? null
      : truePositiveCount / mustFindExpectations.length,
  };
}

function precisionStatus(
  totalFindings: number,
  adjudicatedFindings: number,
): RealWorldPrecisionStatus {
  if (adjudicatedFindings === 0) return "pending-finding-adjudication";
  if (adjudicatedFindings < totalFindings) return "partially-adjudicated";
  return "measured";
}

function calculatePrecision(
  cases: readonly RealWorldCaseObservation[],
): RealWorldPrecisionSummary {
  const findings = cases.flatMap(({ findings }) => findings);
  const adjudications = cases.flatMap((item) =>
    item.findings.flatMap((finding) => {
      const adjudication = findRealWorldFindingAdjudication(item.id, finding.id);
      return adjudication === undefined ? [] : [adjudication];
    })
  );
  const truePositiveFindingCount = adjudications.filter(
    ({ verdict }) => verdict === "true-positive",
  ).length;
  const falsePositiveFindingCount = adjudications.length - truePositiveFindingCount;
  const status = precisionStatus(findings.length, adjudications.length);

  return {
    totalFindings: findings.length,
    adjudicatedFindingCount: adjudications.length,
    truePositiveFindingCount,
    falsePositiveFindingCount,
    findingsPendingAdjudication: findings.length - adjudications.length,
    adjudicationCoverage: findings.length === 0 ? 0 : adjudications.length / findings.length,
    status,
    precision:
      status === "measured" && adjudications.length > 0
        ? truePositiveFindingCount / adjudications.length
        : null,
  };
}

export function buildRealWorldObservationReport(
  reviewUseCases: ReviewUseCases,
  corpus: readonly RealWorldEvaluationCase[],
): RealWorldObservationReport {
  const cases = corpus.map((item) => observeCase(reviewUseCases, item));
  const empiricalNegativeCases = cases.filter(isEmpiricalNegativeControl);
  const empiricalNegativeControlsWithFindings = empiricalNegativeCases.filter(
    ({ findings }) => findings.length > 0,
  ).length;
  const empiricalNegativeFindings = empiricalNegativeCases.flatMap(
    ({ findings }) => findings,
  );
  const cleanCases = cases.filter(({ category }) => category === "clean-negative");
  const empiricalCleanCases = cleanCases.filter(
    ({ measurementFidelity }) => measurementFidelity === "empirical",
  );
  const empiricalCleanControlsWithFindings = empiricalCleanCases.filter(
    ({ findings }) => findings.length > 0,
  ).length;
  const empiricalCleanFindings = empiricalCleanCases.flatMap(({ findings }) => findings);
  const allCleanControlsWithFindings = cleanCases.filter(
    ({ findings }) => findings.length > 0,
  ).length;
  const allCleanFindings = cleanCases.flatMap(({ findings }) => findings);
  const mustFindExpectations = cases.reduce(
    (total, item) =>
      total + item.expectations.filter(({ kind }) => kind === "must-find").length,
    0,
  );
  const mappedMustFind = calculateMappedMustFind(cases);
  const recall = calculateRecall(cases);
  const recallByCohort: Readonly<Record<RealWorldEvaluationCohort, RealWorldRecallSummary>> = {
    "baseline-50": calculateRecall(cases.filter(({ cohort }) => cohort === "baseline-50")),
    "expansion-wave-1": calculateRecall(
      cases.filter(({ cohort }) => cohort === "expansion-wave-1"),
    ),
  };
  const precision = calculatePrecision(cases);
  const precisionByCohort: Readonly<
    Record<RealWorldEvaluationCohort, RealWorldPrecisionSummary>
  > = {
    "baseline-50": calculatePrecision(
      cases.filter(({ cohort }) => cohort === "baseline-50"),
    ),
    "expansion-wave-1": calculatePrecision(
      cases.filter(({ cohort }) => cohort === "expansion-wave-1"),
    ),
  };

  return {
    schemaVersion: REAL_WORLD_OBSERVATION_SCHEMA_VERSION,
    summary: {
      totalCases: cases.length,
      stableCases: cases.filter(({ stable }) => stable).length,
      totalFindings: precision.totalFindings,
      mustFindExpectations,
      mappedMustFindExpectations: mappedMustFind.mapped,
      mappedMustFindDetected: mappedMustFind.detected,
      mappedMustFindRecall:
        mappedMustFind.mapped === 0
          ? null
          : mappedMustFind.detected / mappedMustFind.mapped,
      mustFindExpectationsPendingRuleMapping:
        mustFindExpectations - mappedMustFind.mapped,
      recallTruePositiveCount: recall.truePositiveCount,
      recallFalseNegativeCount: recall.falseNegativeCount,
      adjudicatedRecall: recall.recall,
      recallByCohort,
      precisionStatus: precision.status,
      adjudicatedFindingCount: precision.adjudicatedFindingCount,
      truePositiveFindingCount: precision.truePositiveFindingCount,
      falsePositiveFindingCount: precision.falsePositiveFindingCount,
      findingsPendingAdjudication: precision.findingsPendingAdjudication,
      findingAdjudicationCoverage: precision.adjudicationCoverage,
      precision: precision.precision,
      precisionByCohort,
      empiricalNegativeControls: empiricalNegativeCases.length,
      empiricalNegativeControlsWithFindings,
      empiricalNegativeControlCaseFalsePositiveRate:
        empiricalNegativeCases.length === 0
          ? 0
          : empiricalNegativeControlsWithFindings / empiricalNegativeCases.length,
      empiricalNegativeControlFindingCount: empiricalNegativeFindings.length,
      empiricalNegativeControlMediumOrHigherFindingCount: empiricalNegativeFindings.filter(
        ({ severity }) => MEDIUM_OR_HIGHER.has(severity),
      ).length,
      cleanControls: cleanCases.length,
      syntheticCleanControls: cleanCases.filter(
        ({ measurementFidelity }) => measurementFidelity === "synthetic",
      ).length,
      empiricalCleanControls: empiricalCleanCases.length,
      empiricalCleanControlsWithFindings,
      empiricalCleanControlCaseFalsePositiveRate:
        empiricalCleanCases.length === 0
          ? 0
          : empiricalCleanControlsWithFindings / empiricalCleanCases.length,
      empiricalCleanControlFindingCount: empiricalCleanFindings.length,
      empiricalCleanControlMediumOrHigherFindingCount: empiricalCleanFindings.filter(
        ({ severity }) => MEDIUM_OR_HIGHER.has(severity),
      ).length,
      allCleanControlsWithFindings,
      allCleanControlFindingCount: allCleanFindings.length,
    },
    cases,
  };
}

export function serializeRealWorldObservationReport(
  report: RealWorldObservationReport,
): string {
  return JSON.stringify(report, null, 2);
}
