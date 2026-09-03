import type { AnalyzerSourceFile } from "../analyzer";

export type BenchmarkClass = "small" | "medium" | "large";

export interface ReviewBenchmarkResultV1 {
  readonly version: 1;
  readonly benchmarkClass: BenchmarkClass;
  readonly dataset: {
    readonly files: number;
    readonly lines: number;
  };
  readonly durationsMs: {
    readonly repositoryIndex: number;
    readonly deterministicFull: number;
    readonly incrementalScope: number;
    readonly deterministicIncremental: number;
  };
  readonly peakHeapBytes: number;
  readonly processed: {
    readonly symbols: number;
    readonly findingsFull: number;
    readonly findingsIncremental: number;
    readonly impactedFiles: number;
  };
  readonly findingsEquivalent: boolean;
}

export interface BenchmarkRegressionPolicy {
  readonly maxDurationIncreaseRatio: number;
  readonly maxHeapIncreaseRatio: number;
}

export interface BenchmarkRegression {
  readonly metric: string;
  readonly baseline: number;
  readonly current: number;
  readonly increaseRatio: number;
}

export function createSyntheticBenchmarkFiles(
  benchmarkClass: BenchmarkClass,
): readonly AnalyzerSourceFile[] {
  const fileCount = benchmarkClass === "small" ? 100 : benchmarkClass === "medium" ? 500 : 1500;
  const declarationsPerFile = benchmarkClass === "large" ? 40 : 30;
  return Array.from({ length: fileCount }, (_, fileIndex) => ({
    path: `src/generated/file-${String(fileIndex).padStart(4, "0")}.ts`,
    content: Array.from({ length: declarationsPerFile }, (_unused, declarationIndex) =>
      `export const value_${fileIndex}_${declarationIndex} = ${fileIndex + declarationIndex};`,
    ).join("\n"),
  }));
}

export function countSourceLines(files: readonly AnalyzerSourceFile[]): number {
  return files.reduce((sum, file) => sum + (file.content.length === 0 ? 0 : file.content.split("\n").length), 0);
}

export function detectBenchmarkRegressions(
  current: ReviewBenchmarkResultV1,
  baseline: ReviewBenchmarkResultV1,
  policy: BenchmarkRegressionPolicy,
): readonly BenchmarkRegression[] {
  const candidates = [
    ["durationsMs.repositoryIndex", current.durationsMs.repositoryIndex, baseline.durationsMs.repositoryIndex, policy.maxDurationIncreaseRatio],
    ["durationsMs.deterministicFull", current.durationsMs.deterministicFull, baseline.durationsMs.deterministicFull, policy.maxDurationIncreaseRatio],
    ["durationsMs.deterministicIncremental", current.durationsMs.deterministicIncremental, baseline.durationsMs.deterministicIncremental, policy.maxDurationIncreaseRatio],
    ["peakHeapBytes", current.peakHeapBytes, baseline.peakHeapBytes, policy.maxHeapIncreaseRatio],
  ] as const;

  return candidates.flatMap(([metric, currentValue, baselineValue, maximum]) => {
    if (baselineValue <= 0) return [];
    const increaseRatio = (currentValue - baselineValue) / baselineValue;
    return increaseRatio > maximum
      ? [{ metric, baseline: baselineValue, current: currentValue, increaseRatio }]
      : [];
  });
}
