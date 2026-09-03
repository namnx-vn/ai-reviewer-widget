import { readFileSync } from "node:fs";

import {
  buildRepositoryContext,
  calculateIncrementalAnalysisScope,
  createDeterministicAnalyzerAdapter,
  type AnalyzerFileChange,
} from "../src/analyzer";
import { parseSource } from "../src/analyzer/ast/parser";
import {
  countSourceLines,
  createSyntheticBenchmarkFiles,
  detectBenchmarkRegressions,
  type BenchmarkClass,
  type ReviewBenchmarkResultV1,
} from "../src/evaluation/performance-benchmark";

const benchmarkClass = parseClass(process.argv[2] ?? "small");
const baselinePath = process.argv.find((argument) => argument.startsWith("--baseline="))?.slice("--baseline=".length);
const files = createSyntheticBenchmarkFiles(benchmarkClass);
const initialHeap = process.memoryUsage().heapUsed;

const parseStarted = performance.now();
for (const file of files) parseSource(file.content);
const sourceParse = performance.now() - parseStarted;
const afterParseHeap = process.memoryUsage().heapUsed;

const indexStarted = performance.now();
const repositoryContext = buildRepositoryContext(files);
const repositoryIndex = performance.now() - indexStarted;
const afterIndexHeap = process.memoryUsage().heapUsed;

const adapter = createDeterministicAnalyzerAdapter();
const fullStarted = performance.now();
const full = adapter.analyze(files);
const deterministicFull = performance.now() - fullStarted;
const afterFullHeap = process.memoryUsage().heapUsed;

const changed: readonly AnalyzerFileChange[] = [{
  path: files[0]?.path ?? "src/generated/file-0000.ts",
  status: "modified",
  ranges: [{ startLine: 1, endLine: 1 }],
}];
const scopeStarted = performance.now();
const incrementalScope = calculateIncrementalAnalysisScope(changed, repositoryContext);
const incrementalScopeDuration = performance.now() - scopeStarted;
const incrementalStarted = performance.now();
const incremental = adapter.analyze(files, undefined, incrementalScope);
const deterministicIncremental = performance.now() - incrementalStarted;
const afterIncrementalHeap = process.memoryUsage().heapUsed;

const result: ReviewBenchmarkResultV1 = {
  version: 1,
  benchmarkClass,
  dataset: {
    files: files.length,
    lines: countSourceLines(files),
  },
  durationsMs: {
    sourceParse,
    repositoryIndex,
    deterministicFull,
    totalFull: sourceParse + repositoryIndex + deterministicFull,
    incrementalScope: incrementalScopeDuration,
    deterministicIncremental,
  },
  peakHeapBytes: Math.max(initialHeap, afterParseHeap, afterIndexHeap, afterFullHeap, afterIncrementalHeap),
  processed: {
    symbols: repositoryContext.declarations.length,
    findingsFull: full.findings.length,
    findingsIncremental: incremental.findings.length,
    impactedFiles: incrementalScope.impactedFiles.length,
  },
  findingsEquivalent: stableFindingKeys(full.findings).join("\n") === stableFindingKeys(incremental.findings).join("\n"),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (benchmarkClass === "medium" && result.durationsMs.totalFull >= 60_000) {
  process.stderr.write(`Medium repository target exceeded: ${Math.round(result.durationsMs.totalFull)}ms >= 60000ms\n`);
  process.exitCode = 1;
}

if (baselinePath !== undefined) {
  const baseline = parseBaseline(readFileSync(baselinePath, "utf8"));
  const regressions = detectBenchmarkRegressions(result, baseline, {
    maxDurationIncreaseRatio: 0.25,
    maxHeapIncreaseRatio: 0.25,
  });
  if (regressions.length > 0) {
    process.stderr.write(`${JSON.stringify({ regressions }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

function parseClass(value: string): BenchmarkClass {
  if (value === "small" || value === "medium" || value === "large") return value;
  throw new Error(`Unsupported benchmark class: ${value}`);
}

function parseBaseline(source: string): ReviewBenchmarkResultV1 {
  const value: unknown = JSON.parse(source);
  if (!isReviewBenchmarkResult(value)) throw new Error("Unsupported benchmark baseline schema.");
  return value;
}

function isReviewBenchmarkResult(value: unknown): value is ReviewBenchmarkResultV1 {
  if (!isRecord(value) || value.version !== 1 || !isBenchmarkClass(value.benchmarkClass)) return false;
  if (!isRecord(value.dataset) || !isFiniteNumber(value.dataset.files) || !isFiniteNumber(value.dataset.lines)) return false;
  if (!isRecord(value.durationsMs)) return false;
  if (!isFiniteNumber(value.durationsMs.sourceParse)
    || !isFiniteNumber(value.durationsMs.repositoryIndex)
    || !isFiniteNumber(value.durationsMs.deterministicFull)
    || !isFiniteNumber(value.durationsMs.totalFull)
    || !isFiniteNumber(value.durationsMs.incrementalScope)
    || !isFiniteNumber(value.durationsMs.deterministicIncremental)) return false;
  if (!isFiniteNumber(value.peakHeapBytes) || !isRecord(value.processed)) return false;
  if (!isFiniteNumber(value.processed.symbols)
    || !isFiniteNumber(value.processed.findingsFull)
    || !isFiniteNumber(value.processed.findingsIncremental)
    || !isFiniteNumber(value.processed.impactedFiles)) return false;
  return typeof value.findingsEquivalent === "boolean";
}

function isBenchmarkClass(value: unknown): value is BenchmarkClass {
  return value === "small" || value === "medium" || value === "large";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableFindingKeys(findings: readonly { readonly ruleId: string; readonly id: string }[]): readonly string[] {
  return findings.map((finding) => `${finding.ruleId}:${finding.id}`).sort();
}
