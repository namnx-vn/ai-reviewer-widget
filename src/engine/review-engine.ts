import type {
  AIProvider,
} from "../ai/types";

import type {
  ReviewFinding,
  ReviewResult,
  ReviewWarning,
} from "../domain/review";

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
} from "../domain/review";

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

  warnings?: readonly ReviewWarning[];
}

export class ReviewEngine {
  async execute(
    input: ReviewEngineInput,
  ): Promise<ReviewResult> {
    const startedAt =
      performance.now();

    let aiFindings:
      ReviewFinding[] = [];
    const warnings: ReviewWarning[] = [...(input.warnings ?? [])];

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

        warnings.push(
          ...(aiResult.warnings ?? []).map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
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
