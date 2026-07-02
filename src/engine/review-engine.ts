import { aggregateReview } from "../review/aggregator";
import { ReviewResult } from "../review/types";
import { applyConfidence } from "./confidence";
import { deduplicateFindings } from "./deduplicate";
import { mergeFindings } from "./merge";
import { PipelineContext } from "./pipeline";
import { adjustSeverity } from "./severity";

export class ReviewEngine {
  async execute(context: PipelineContext): Promise<ReviewResult> {
    const merged = mergeFindings(
      context.deterministicFindings,
      context.aiFindings,
    );

    const deduplicated = deduplicateFindings(merged);

    const confidence = applyConfidence(deduplicated);

    const adjusted = adjustSeverity(confidence);

    return aggregateReview(adjusted, 0);
  }
}
