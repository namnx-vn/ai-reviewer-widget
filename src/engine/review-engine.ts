import type {
  AIProvider,
} from "../ai/types";

import type {
  ReviewFinding,
  ReviewResult,
  ReviewWarning,
} from "../review/types";

import {
  mergeFindings,
} from "./merge";

import {
  deduplicateFindings,
} from "./deduplicate";

import {
  applyConfidence,
} from "./confidence";

import {
  adjustSeverity,
} from "./severity";

import {
  aggregateReview,
} from "../review/aggregator";

import {
  normalizeAIFindings,
} from "./normalize";

export interface ReviewEngineInput {
  deterministicFindings:
    ReviewFinding[];

  aiProvider?: AIProvider;

  aiInput?: Parameters<
    AIProvider["review"]
  >[0];
}

export class ReviewEngine {
  async execute(
    input: ReviewEngineInput,
  ): Promise<ReviewResult> {
    const startedAt =
      performance.now();

    let aiFindings:
      ReviewFinding[] = [];
    const warnings: ReviewWarning[] = [];

    if (
      input.aiProvider &&
      input.aiInput
    ) {
      try {
        const aiResult =
          await input.aiProvider.review(
            input.aiInput,
          );

        aiFindings =
          normalizeAIFindings(
            aiResult,
          );
      } catch {
        warnings.push({
          code: "AI_REVIEW_FAILED",
          message:
            "AI review was unavailable; deterministic results were returned.",
        });
      }
    }

    const merged =
      mergeFindings(
        input.deterministicFindings,
        aiFindings,
      );

    const deduplicated =
      deduplicateFindings(
        merged,
      );

    const confident =
      applyConfidence(
        deduplicated,
      );

    const adjusted =
      adjustSeverity(
        confident,
      );

    return aggregateReview(
      adjusted,
      performance.now() -
        startedAt,
      warnings,
    );
  }
}
