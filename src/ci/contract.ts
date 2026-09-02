import type { ReviewResult } from "../domain/review";

export const CI_SCHEMA_VERSION = 1;

export type PortableReview = Pick<
  ReviewResult,
  "decision" | "score" | "findings" | "stats" | "warnings" | "securityQualityGate"
>;

export interface CiMetadata {
  readonly provider?: string;
  readonly repository?: string;
  readonly revision?: string;
}

interface CiExecutionBase {
  readonly schemaVersion: typeof CI_SCHEMA_VERSION;
  readonly exitCode: 0 | 1 | 2;
  readonly metadata?: CiMetadata;
}

export type CiExecutionResult =
  | (CiExecutionBase & {
      readonly status: "success";
      readonly exitCode: 0;
      readonly review: PortableReview;
    })
  | (CiExecutionBase & {
      readonly status: "review_failed";
      readonly exitCode: 1;
      readonly review: PortableReview;
    })
  | (CiExecutionBase & {
      readonly status: "analysis_failed";
      readonly exitCode: 2;
      readonly error: { readonly message: string };
    })
  | (CiExecutionBase & {
      readonly status: "publication_failed";
      readonly exitCode: 2;
      readonly review: PortableReview;
      readonly error: { readonly message: string };
    });

export function createPortableReview(result: ReviewResult): PortableReview {
  return {
    decision: result.decision,
    score: result.score,
    findings: result.findings,
    stats: result.stats,
    warnings: result.warnings,
    ...(result.securityQualityGate === undefined
      ? {}
      : { securityQualityGate: result.securityQualityGate }),
  };
}
