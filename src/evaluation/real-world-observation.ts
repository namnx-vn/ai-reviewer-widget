import type { ReviewUseCases } from "../application/review";
import type { ReviewFinding, ReviewWarning, Severity } from "../domain/review";
import type {
  PublicPullRequestReference,
  RealWorldEvaluationCase,
  RealWorldExpectation,
} from "./real-world";

export const REAL_WORLD_OBSERVATION_SCHEMA_VERSION = 1 as const;

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
  readonly findings: readonly RealWorldFindingObservation[];
  readonly warnings: readonly RealWorldWarningObservation[];
  readonly stable: boolean;
}

export interface RealWorldObservationSummary {
  readonly totalCases: number;
  readonly stableCases: number;
  readonly totalFindings: number;
  readonly mustFindExpectations: number;
  readonly mustFindExpectationsPendingRuleMapping: number;
  readonly precisionStatus: "pending-rule-mapping";
  readonly cleanControls: number;
  readonly cleanControlsWithFindings: number;
  readonly cleanControlCaseFalsePositiveRate: number;
  readonly cleanControlFindingCount: number;
  readonly cleanControlMediumOrHigherFindingCount: number;
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
    findings: first.findings.map(observeFinding),
    warnings: first.warnings.map(({ code, message }) => ({ code, message })),
    stable: JSON.stringify(firstIdentities) === JSON.stringify(secondIdentities),
  };
}

export function buildRealWorldObservationReport(
  reviewUseCases: ReviewUseCases,
  corpus: readonly RealWorldEvaluationCase[],
): RealWorldObservationReport {
  const cases = corpus.map((item) => observeCase(reviewUseCases, item));
  const cleanCases = cases.filter(({ category }) => category === "clean-negative");
  const cleanControlsWithFindings = cleanCases.filter(
    ({ findings }) => findings.length > 0,
  ).length;
  const cleanFindings = cleanCases.flatMap(({ findings }) => findings);
  const mustFindExpectations = cases.reduce(
    (total, item) =>
      total + item.expectations.filter(({ kind }) => kind === "must-find").length,
    0,
  );

  return {
    schemaVersion: REAL_WORLD_OBSERVATION_SCHEMA_VERSION,
    summary: {
      totalCases: cases.length,
      stableCases: cases.filter(({ stable }) => stable).length,
      totalFindings: cases.reduce(
        (total, item) => total + item.findings.length,
        0,
      ),
      mustFindExpectations,
      mustFindExpectationsPendingRuleMapping: mustFindExpectations,
      precisionStatus: "pending-rule-mapping",
      cleanControls: cleanCases.length,
      cleanControlsWithFindings,
      cleanControlCaseFalsePositiveRate:
        cleanCases.length === 0 ? 0 : cleanControlsWithFindings / cleanCases.length,
      cleanControlFindingCount: cleanFindings.length,
      cleanControlMediumOrHigherFindingCount: cleanFindings.filter(({ severity }) =>
        MEDIUM_OR_HIGHER.has(severity)
      ).length,
    },
    cases,
  };
}

export function serializeRealWorldObservationReport(
  report: RealWorldObservationReport,
): string {
  return JSON.stringify(report, null, 2);
}
