import { analyzeFile } from "../analyzer";
import { aggregateReview } from "./aggregator";
import type { ReviewResult } from "./types";

export interface ReviewFile {
  path: string;
  content: string;
}

export function reviewFiles(
  files: ReviewFile[],
): ReviewResult {
  const startedAt = performance.now();

  const findings = files.flatMap(
    ({ path, content }) =>
      analyzeFile(path, content),
  );

  return aggregateReview(
    findings,
    performance.now() - startedAt,
  );
}