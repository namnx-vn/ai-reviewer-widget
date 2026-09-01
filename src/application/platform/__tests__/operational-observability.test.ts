import { describe, expect, it } from "vitest";

import type { ReviewResult } from "../../../domain/review";
import type { OperationalTelemetryEvent } from "../../observability";
import type { ReviewUseCases } from "../../review";
import { PLATFORM_API_VERSION, createPlatformReviewService } from "..";

const result: ReviewResult = {
  score: 100,
  decision: "PASS",
  findings: [],
  stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  warnings: [],
  durationMs: 1,
};

describe("platform operational observability", () => {
  it("emits persistence diagnostics with the persistence category", async () => {
    const events: OperationalTelemetryEvent[] = [];
    const service = createPlatformReviewService({
      reviewUseCases: useCases(),
      persistence: {
        save: async () => { throw new Error("storage unavailable"); },
      },
      operationalTelemetry: { record: (event) => events.push(event) },
      now: sequenceClock(1, 2, 3, 4, 5, 6, 7, 8, 9),
    });

    await expect(service.review({
      version: PLATFORM_API_VERSION,
      source: { kind: "inline", files: [] },
      review: { mode: "files" },
    })).rejects.toThrow("storage unavailable");

    expect(events).toContainEqual(expect.objectContaining({
      type: "diagnostic",
      category: "persistence",
      outcome: "failed",
      code: "PERSISTENCE_FAILED",
    }));
  });

  it("keeps platform results unchanged when the operational sink throws", async () => {
    const service = createPlatformReviewService({
      reviewUseCases: useCases(),
      operationalTelemetry: {
        record: () => { throw new Error("telemetry unavailable"); },
      },
    });

    const response = await service.review({
      version: PLATFORM_API_VERSION,
      source: { kind: "inline", files: [] },
      review: { mode: "files" },
    });

    expect(response.result).toBe(result);
  });
});

function useCases(): ReviewUseCases {
  return {
    reviewFiles: () => result,
    reviewPullRequest: async () => result,
  };
}

function sequenceClock(...values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}
