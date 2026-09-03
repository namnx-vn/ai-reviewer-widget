import type { EvaluationReport } from "./contracts";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatEvaluationReport(report: EvaluationReport): string {
  const lines = [
    `Evaluation report (${report.cases.length} cases)`,
    `Precision: ${percent(report.summary.precision)}`,
    `Recall: ${percent(report.summary.recall)}`,
    `Severity accuracy: ${percent(report.summary.severityAccuracy)}`,
    `Duplicate rate: ${percent(report.summary.duplicateRate)}`,
    `Stability: ${percent(report.summary.stability)}`,
    `False positives: ${report.summary.falsePositiveCount}`,
    `False negatives: ${report.summary.falseNegativeCount}`,
    `Runtime: ${report.summary.runtimeMs.toFixed(1)}ms`,
  ];

  for (const evaluationCase of report.cases) {
    lines.push(
      "",
      `${evaluationCase.caseId}: ${evaluationCase.title}`,
      `  precision=${percent(evaluationCase.metrics.precision)} recall=${percent(evaluationCase.metrics.recall)} stability=${percent(evaluationCase.metrics.stability)}`,
      `  fp=${evaluationCase.metrics.falsePositiveCount} fn=${evaluationCase.metrics.falseNegativeCount} runtime=${evaluationCase.metrics.runtimeMs.toFixed(1)}ms`,
    );
  }

  return lines.join("\n");
}

export function serializeEvaluationReport(report: EvaluationReport): string {
  return JSON.stringify(report, null, 2);
}
