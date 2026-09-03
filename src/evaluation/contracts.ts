import type { ReviewFinding, Severity } from "../domain/review";
import type { SourceFile } from "../application/review";

export const EVALUATION_CASE_VERSION = 1 as const;

export interface ExpectedFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: Severity;
  readonly file?: string;
  readonly line?: number;
}

export interface EvaluationCase {
  readonly version: typeof EVALUATION_CASE_VERSION;
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly files: readonly SourceFile[];
  readonly expectedFindings: readonly ExpectedFinding[];
}

export interface FindingMatch {
  readonly expected: ExpectedFinding;
  readonly actual: ReviewFinding;
}

export interface FindingMatchResult {
  readonly matches: readonly FindingMatch[];
  readonly falsePositives: readonly ReviewFinding[];
  readonly falseNegatives: readonly ExpectedFinding[];
}

export interface EvaluationMetrics {
  readonly expectedCount: number;
  readonly actualCount: number;
  readonly matchedCount: number;
  readonly precision: number;
  readonly recall: number;
  readonly falsePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly severityAccuracy: number;
  readonly duplicateRate: number;
  readonly stability: number;
  readonly runtimeMs: number;
}

export interface EvaluationCaseReport {
  readonly caseId: string;
  readonly title: string;
  readonly category: string;
  readonly metrics: EvaluationMetrics;
  readonly matchResult: FindingMatchResult;
}

export interface EvaluationReport {
  readonly version: 1;
  readonly generatedAt: string;
  readonly cases: readonly EvaluationCaseReport[];
  readonly summary: EvaluationMetrics;
}
