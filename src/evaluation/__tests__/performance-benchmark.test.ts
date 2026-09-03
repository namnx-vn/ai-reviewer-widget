import { describe, expect, it } from "vitest";

import {
  countSourceLines,
  createSyntheticBenchmarkFiles,
  detectBenchmarkRegressions,
  type ReviewBenchmarkResultV1,
} from "../performance-benchmark";

function result(duration: number, heap: number): ReviewBenchmarkResultV1 {
  return {
    version: 1,
    benchmarkClass: "small",
    dataset: { files: 100, lines: 3000 },
    durationsMs: {
      repositoryIndex: duration,
      deterministicFull: duration,
      incrementalScope: duration / 10,
      deterministicIncremental: duration,
    },
    peakHeapBytes: heap,
    processed: { symbols: 3000, findingsFull: 0, findingsIncremental: 0, impactedFiles: 1 },
    findingsEquivalent: true,
  };
}

describe("performance benchmark contracts", () => {
  it("generates controlled deterministic benchmark classes", () => {
    const small = createSyntheticBenchmarkFiles("small");
    const medium = createSyntheticBenchmarkFiles("medium");
    const large = createSyntheticBenchmarkFiles("large");

    expect(small).toHaveLength(100);
    expect(countSourceLines(small)).toBe(3000);
    expect(countSourceLines(medium)).toBe(15000);
    expect(countSourceLines(large)).toBe(60000);
    expect(createSyntheticBenchmarkFiles("small")).toEqual(small);
  });

  it("detects duration and memory regressions against an explicit policy", () => {
    const regressions = detectBenchmarkRegressions(result(140, 1400), result(100, 1000), {
      maxDurationIncreaseRatio: 0.25,
      maxHeapIncreaseRatio: 0.25,
    });

    expect(regressions.map(({ metric }) => metric)).toEqual([
      "durationsMs.repositoryIndex",
      "durationsMs.deterministicFull",
      "durationsMs.deterministicIncremental",
      "peakHeapBytes",
    ]);
  });

  it("does not report stable measurements or divide by zero baselines", () => {
    expect(detectBenchmarkRegressions(result(110, 1100), result(100, 1000), {
      maxDurationIncreaseRatio: 0.25,
      maxHeapIncreaseRatio: 0.25,
    })).toEqual([]);
    expect(detectBenchmarkRegressions(result(110, 1100), result(0, 0), {
      maxDurationIncreaseRatio: 0,
      maxHeapIncreaseRatio: 0,
    })).toEqual([]);
  });
});
