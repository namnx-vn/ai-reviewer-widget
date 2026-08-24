import { describe, expect, it, vi } from "vitest";

import type { ReviewFinding } from "../../../domain/review";
import type {
  DeterministicReviewPort,
  PreparedAIReviewInput,
  ReviewPipelinePort,
} from "../ports";
import { createReviewUseCases } from "../use-cases";

const finding: ReviewFinding = {
  id: "deterministic-1",
  ruleId: "quality.example",
  title: "Example",
  message: "Example finding",
  severity: "low",
  source: "ast",
  confidence: 1,
};

describe("application review use cases", () => {
  it("coordinates a synchronous file review through the deterministic port", () => {
    const analyze = vi.fn(() => ({ findings: [finding], warnings: [] }));
    const deterministic: DeterministicReviewPort = { analyze };
    const useCases = createReviewUseCases({
      deterministic,
      pipeline: unusedPipeline(),
      prepareAIInput: () => preparedInput(),
      evaluateQualityGate: () => { throw new Error("not requested"); },
      now: sequenceClock(10, 15),
    });

    const result = useCases.reviewFiles([{ path: "src/example.ts", content: "const value = 1;" }]);

    expect(analyze).toHaveBeenCalledOnce();
    expect(result.findings).toEqual([finding]);
    expect(result.durationMs).toBe(5);
  });

  it("keeps deterministic warnings when AI input has no changed patch", async () => {
    const execute = vi.fn(async (input: Parameters<ReviewPipelinePort["execute"]>[0]) => ({
      score: 97,
      decision: "PASS" as const,
      findings: input.deterministicFindings,
      stats: { critical: 0, high: 0, medium: 0, low: 1, info: 0 },
      warnings: [...input.warnings],
      durationMs: 1,
    }));
    const useCases = createReviewUseCases({
      deterministic: {
        analyze: () => ({
          findings: [finding],
          warnings: [{ code: "SOURCE_PARSE_FAILED", message: "broken source" }],
        }),
      },
      pipeline: { execute },
      prepareAIInput: () => preparedInput({ omittedFiles: 1 }),
      evaluateQualityGate: () => { throw new Error("not requested"); },
      now: () => 0,
    });

    const review = vi.fn(async () => ({ findings: [] }));
    const result = await useCases.reviewPullRequest({
      title: "No patch",
      files: [{ path: "src/example.ts", content: "const value = 1;" }],
    }, { name: "test", review });

    expect(review).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ aiInput: undefined }));
    expect(result.warnings).toEqual([
      { code: "SOURCE_PARSE_FAILED", message: "broken source" },
      {
        code: "AI_INPUT_OMITTED",
        message: "AI review was skipped because no changed-line patch was available.",
      },
    ]);
  });

  it("sends only policy-prepared metadata and findings to the AI pipeline", async () => {
    const execute = vi.fn(async (input: Parameters<ReviewPipelinePort["execute"]>[0]) => ({
      score: 100,
      decision: "PASS" as const,
      findings: [],
      stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      warnings: [...input.warnings],
      durationMs: 1,
    }));
    const useCases = createReviewUseCases({
      deterministic: { analyze: () => ({ findings: [finding], warnings: [] }) },
      pipeline: { execute },
      prepareAIInput: () => preparedInput({
        diff: "+safe change",
        title: "[REDACTED] title",
        description: "[REDACTED] description",
        deterministicFindings: "[REDACTED] findings",
        redactedValues: 3,
      }),
      evaluateQualityGate: () => { throw new Error("not requested"); },
      now: () => 0,
    });

    await useCases.reviewPullRequest({
      title: "raw title",
      description: "raw description",
      files: [{ path: "src/example.ts", content: "", patch: "+raw patch" }],
    }, { name: "test", review: async () => ({ findings: [] }) });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      aiInput: {
        pullRequestTitle: "[REDACTED] title",
        pullRequestDescription: "[REDACTED] description",
        diff: "+safe change",
        deterministicFindings: "[REDACTED] findings",
      },
    }));
  });
});

function unusedPipeline(): ReviewPipelinePort {
  return { execute: async () => { throw new Error("not used"); } };
}

function sequenceClock(...values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

function preparedInput(
  overrides: Partial<PreparedAIReviewInput> = {},
): PreparedAIReviewInput {
  return {
    title: "Review title",
    deterministicFindings: "[]",
    omittedFiles: 0,
    redactedValues: 0,
    truncated: false,
    ...overrides,
  };
}
