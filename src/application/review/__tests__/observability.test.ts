import { describe, expect, it, vi } from "vitest";

import type { ReviewResult } from "../../../domain/review";
import type { OperationalTelemetryEvent } from "../../observability";
import { createReviewUseCases } from "../use-cases";

const result: ReviewResult = {
  score: 100,
  decision: "PASS",
  findings: [],
  stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  warnings: [],
  durationMs: 1,
};

describe("review observability", () => {
  it("emits deterministic timing without changing file review results", () => {
    const events: OperationalTelemetryEvent[] = [];
    const review = createReviewUseCases({
      deterministic: { analyze: () => ({ findings: [], warnings: [] }) },
      pipeline: { execute: async () => result },
      prepareAIInput: () => ({
        title: "title",
        deterministicFindings: "[]",
        omittedFiles: 0,
        redactedValues: 0,
        truncated: false,
      }),
      evaluateQualityGate: () => { throw new Error("unused"); },
      telemetry: { record: (event) => events.push(event) },
      now: sequenceClock(10, 11, 14, 15),
    });

    const output = review.reviewFiles([{ path: "src/example.ts", content: "const x = 1;" }]);

    expect(output.decision).toBe("PASS");
    expect(events).toContainEqual({
      type: "stage",
      stage: "deterministic.analysis",
      outcome: "completed",
      durationMs: 3,
    });
  });

  it("captures safe AI usage metadata and isolates telemetry sink failures", async () => {
    const record = vi.fn((event: OperationalTelemetryEvent) => {
      if (event.stage === "ai.review" && event.outcome === "completed") {
        throw new Error("telemetry unavailable");
      }
    });
    const review = createReviewUseCases({
      deterministic: { analyze: () => ({ findings: [], warnings: [] }) },
      pipeline: {
        execute: async (input) => {
          await input.aiReviewer?.review(input.aiInput!);
          return result;
        },
      },
      prepareAIInput: () => ({
        title: "safe title",
        diff: "+safe change",
        deterministicFindings: "[]",
        omittedFiles: 0,
        redactedValues: 1,
        truncated: false,
      }),
      evaluateQualityGate: () => { throw new Error("unused"); },
      telemetry: { record },
      now: sequenceClock(1, 2, 4, 5, 9),
    });

    const output = await review.reviewPullRequest({
      title: "raw title",
      files: [{ path: "src/example.ts", content: "secret source", patch: "+safe change" }],
    }, {
      name: "safe-provider",
      review: async () => ({
        findings: [],
        usage: {
          model: "safe-model",
          requestCount: 1,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          retryCount: 0,
          partialFailureCount: 0,
        },
      }),
    });

    expect(output).toBe(result);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      type: "stage",
      stage: "ai.review",
      outcome: "completed",
      usage: expect.objectContaining({ model: "safe-model", totalTokens: 15 }),
    }));
    expect(JSON.stringify(record.mock.calls)).not.toContain("secret source");
    expect(JSON.stringify(record.mock.calls)).not.toContain("raw title");
  });
});

function sequenceClock(...values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}
