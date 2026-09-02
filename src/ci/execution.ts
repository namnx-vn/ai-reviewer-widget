import type { ReviewResult } from "../domain/review";
import {
  CI_SCHEMA_VERSION,
  createPortableReview,
  type CiExecutionResult,
  type CiMetadata,
} from "./contract";

export interface CiReviewAnalysis {
  readonly result: ReviewResult;
}

export interface CiExecutionDependencies<TAnalysis extends CiReviewAnalysis> {
  readonly analyze: () => Promise<TAnalysis>;
  readonly publish?: (analysis: TAnalysis) => Promise<void>;
  readonly metadata?: CiMetadata;
}

export async function executeCiReview<TAnalysis extends CiReviewAnalysis>(
  dependencies: CiExecutionDependencies<TAnalysis>,
): Promise<CiExecutionResult> {
  let analysis: TAnalysis;
  try {
    analysis = await dependencies.analyze();
  } catch {
    return withMetadata({
      schemaVersion: CI_SCHEMA_VERSION,
      status: "analysis_failed",
      exitCode: 2,
      error: { message: "Review analysis failed." },
    }, dependencies.metadata);
  }

  const review = createPortableReview(analysis.result);
  if (dependencies.publish !== undefined) {
    try {
      await dependencies.publish(analysis);
    } catch {
      return withMetadata({
        schemaVersion: CI_SCHEMA_VERSION,
        status: "publication_failed",
        exitCode: 2,
        review,
        error: { message: "Review publication failed." },
      }, dependencies.metadata);
    }
  }

  return analysis.result.decision === "FAIL"
    ? withMetadata({
        schemaVersion: CI_SCHEMA_VERSION,
        status: "review_failed",
        exitCode: 1,
        review,
      }, dependencies.metadata)
    : withMetadata({
        schemaVersion: CI_SCHEMA_VERSION,
        status: "success",
        exitCode: 0,
        review,
      }, dependencies.metadata);
}

function withMetadata<T extends CiExecutionResult>(
  result: T,
  metadata: CiMetadata | undefined,
): T {
  return metadata === undefined ? result : { ...result, metadata };
}
