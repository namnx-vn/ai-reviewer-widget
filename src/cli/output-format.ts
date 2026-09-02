import { CI_SCHEMA_VERSION, formatPortableReviewDocument } from "../ci";
import type { PortableReviewDocument } from "../ci";
import type { ReviewResult } from "../domain/review";

export const CLI_JSON_SCHEMA_VERSION = CI_SCHEMA_VERSION;
export type CliJsonReviewDocument = PortableReviewDocument;

export function formatJsonReviewResult(result: ReviewResult): string {
  return formatPortableReviewDocument(result);
}
