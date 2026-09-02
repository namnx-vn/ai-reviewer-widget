import type { ReviewResult } from "../domain/review";
import { CI_SCHEMA_VERSION, createPortableReview, type PortableReview } from "./contract";

export interface PortableReviewDocument {
  readonly schemaVersion: typeof CI_SCHEMA_VERSION;
  readonly result: PortableReview;
}

export function createPortableReviewDocument(result: ReviewResult): PortableReviewDocument {
  return {
    schemaVersion: CI_SCHEMA_VERSION,
    result: createPortableReview(result),
  };
}

export function formatPortableReviewDocument(result: ReviewResult): string {
  return `${JSON.stringify(createPortableReviewDocument(result), null, 2)}\n`;
}
