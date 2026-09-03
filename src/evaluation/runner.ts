import type { ReviewUseCases } from "../application/review";
import type { ReviewFinding } from "../domain/review";
import type { EvaluationCase, EvaluationCaseReport, EvaluationReport } from "./contracts";
import { matchFindings } from "./matcher";
import { calculateEvaluationMetrics, calculateStability, summarizeMetrics } from "./metrics";

export interface EvaluationRunnerOptions {
  readonly repetitions?: number;
  readonly now?: () => number;
  readonly generatedAt?: () => string;
}

export function runEvaluationCase(
  reviewUseCases: ReviewUseCases,
  evaluationCase: EvaluationCase,
  options: EvaluationRunnerOptions = {},
): EvaluationCaseReport {
  const repetitions = Math.max(1, options.repetitions ?? 1);
  const now = options.now ?? (() => performance.now());
  const runs: ReviewFinding[][] = [];
  let runtimeMs = 0;

  for (let index = 0; index < repetitions; index += 1) {
    const startedAt = now();
    const result = reviewUseCases.reviewFiles(evaluationCase.files);
    runtimeMs += now() - startedAt;
    runs.push(result.findings);
  }

  const actualFindings = runs[0] ?? [];
  const matchResult = matchFindings(evaluationCase.expectedFindings, actualFindings);

  return {
    caseId: evaluationCase.id,
    title: evaluationCase.title,
    category: evaluationCase.category,
    metrics: calculateEvaluationMetrics(
      matchResult,
      actualFindings,
      runtimeMs / repetitions,
      calculateStability(runs),
    ),
    matchResult,
  };
}

export function runEvaluationSuite(
  reviewUseCases: ReviewUseCases,
  evaluationCases: readonly EvaluationCase[],
  options: EvaluationRunnerOptions = {},
): EvaluationReport {
  const cases = evaluationCases.map((evaluationCase) =>
    runEvaluationCase(reviewUseCases, evaluationCase, options),
  );

  return {
    version: 1,
    generatedAt: (options.generatedAt ?? (() => new Date().toISOString()))(),
    cases,
    summary: summarizeMetrics(cases.map(({ metrics }) => metrics)),
  };
}
