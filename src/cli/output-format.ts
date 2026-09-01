import type { ReviewResult } from "../domain/review";

export const CLI_JSON_SCHEMA_VERSION = 1;

export interface CliJsonReviewDocument {
  readonly schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  readonly result: Pick<
    ReviewResult,
    "decision" | "score" | "findings" | "stats" | "warnings" | "securityQualityGate"
  >;
}

export function formatJsonReviewResult(result: ReviewResult): string {
  const document: CliJsonReviewDocument = {
    schemaVersion: CLI_JSON_SCHEMA_VERSION,
    result: {
      decision: result.decision,
      score: result.score,
      findings: result.findings,
      stats: result.stats,
      warnings: result.warnings,
      ...(result.securityQualityGate === undefined
        ? {}
        : { securityQualityGate: result.securityQualityGate }),
    },
  };

  return `${JSON.stringify(document, null, 2)}\n`;
}
