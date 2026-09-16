import type { Severity } from "../domain/review";

export interface ScorecardDimensions {
  ruleId: string;
  ruleFamily: string;
  severity: Severity;
  provenance: "deterministic" | "ai";
  language: string;
  framework: string;
  profile: string;
  repositoryCategory: string;
  changeScope: string;
  findingScope: "changed-line" | "repository-context";
  cohort: string;
}
export type ScorecardVerdict = "true-positive" | "false-positive" | "duplicate" | "not-actionable" | "severity-too-high" | "severity-too-low" | "pending" | "invalid-fixture";
interface Identity { id: string; caseId: string; repositoryId: string; dimensions: ScorecardDimensions }
export interface ScorecardFinding extends Identity { verdict: ScorecardVerdict }
export interface ScorecardExpectation extends Identity { detected: boolean | null; qualityStatus?: "eligible" | "invalid-fixture" }
export interface ScorecardNegativeControl extends Identity { violation: boolean | null; qualityStatus?: "eligible" | "invalid-fixture" }
export interface ScorecardExecution {
  caseId: string;
  success: boolean;
  fallback: boolean | null;
  stable: boolean | null;
  runtimeMs: number | null;
  memoryBytes: number | null;
  aiRequests: number | null;
  aiCost: number | null;
}
export interface ScorecardInput {
  datasetVersion: string;
  reviewerVersion: string;
  findings: readonly ScorecardFinding[];
  expectations: readonly ScorecardExpectation[];
  negativeControls?: readonly ScorecardNegativeControl[];
  executions: readonly ScorecardExecution[];
}
export interface ScorecardRatio { numerator: number; denominator: number; value: number | null }
export interface ScorecardMetrics {
  emittedFindings: number;
  adjudicatedFindings: number;
  pendingFindings: number;
  excludedFindings: number;
  pendingExpectations: number;
  excludedExpectations: number;
  precisionStatus: "measured" | "partial" | "insufficient-evidence";
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  noiseCount: number;
  precision: ScorecardRatio;
  recall: ScorecardRatio;
  f1: number | null;
  falsePositiveRate: ScorecardRatio;
  falseNegativeRate: ScorecardRatio;
  duplicateRate: ScorecardRatio;
  severityAccuracy: ScorecardRatio;
  actionabilityRate: ScorecardRatio;
  adjudicationCoverage: ScorecardRatio;
}
export interface ScorecardRow { key: string; metrics: ScorecardMetrics }
export interface ReliabilityScorecard {
  schemaVersion: "1";
  datasetVersion: string;
  reviewerVersion: string;
  summary: ScorecardMetrics;
  dimensions: { [K in keyof ScorecardDimensions]: readonly ScorecardRow[] };
  noiseRanking: readonly ScorecardRow[];
  missRanking: readonly ScorecardRow[];
  operations: {
    successRate: ScorecardRatio; fallbackRate: ScorecardRatio; stability: ScorecardRatio;
    runtimeMs: number | null; memoryBytes: number | null; aiRequests: number | null; aiCost: number | null;
    measurementCounts: { runtimeMs: number; memoryBytes: number; aiRequests: number; aiCost: number };
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected scorecard object");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) throw new Error("Expected canonical scorecard identifier");
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  const result = allowed.find(item => item === value);
  if (result === undefined) throw new Error("Invalid scorecard enum");
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected scorecard boolean");
  return value;
}
function nullableBoolean(value: unknown): boolean | null { return value === null ? null : boolean(value); }
function measurement(value: unknown, integer = false): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new Error("Invalid operational measurement");
  return value;
}
function dimensions(value: unknown): ScorecardDimensions {
  const d = record(value);
  return {
    ruleId: text(d.ruleId), ruleFamily: text(d.ruleFamily), severity: choice(d.severity, ["critical", "high", "medium", "low", "info"]),
    provenance: choice(d.provenance, ["deterministic", "ai"]), language: text(d.language), framework: text(d.framework), profile: text(d.profile),
    repositoryCategory: text(d.repositoryCategory), changeScope: text(d.changeScope), findingScope: choice(d.findingScope, ["changed-line", "repository-context"]), cohort: text(d.cohort),
  };
}
function identity(value: Record<string, unknown>): Identity {
  return { id: text(value.id), caseId: text(value.caseId), repositoryId: text(value.repositoryId), dimensions: dimensions(value.dimensions) };
}
function list<T>(value: unknown, parse: (entry: Record<string, unknown>) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error("Expected scorecard array");
  return value.map((entry: unknown) => parse(record(entry)));
}
function unique(entries: readonly { id: string; caseId: string }[]): void {
  if (new Set(entries.map(e => JSON.stringify([e.caseId, e.id]))).size !== entries.length) throw new Error("Duplicate scorecard identity");
}
function parseInput(value: unknown): ScorecardInput {
  const input = record(value);
  const parsed: ScorecardInput = {
    datasetVersion: text(input.datasetVersion), reviewerVersion: text(input.reviewerVersion),
    findings: list(input.findings, f => ({ ...identity(f), verdict: choice(f.verdict, ["true-positive", "false-positive", "duplicate", "not-actionable", "severity-too-high", "severity-too-low", "pending", "invalid-fixture"]) })),
    expectations: list(input.expectations, (e): ScorecardExpectation => ({ ...identity(e), detected: nullableBoolean(e.detected), qualityStatus: choice<"eligible" | "invalid-fixture">(e.qualityStatus ?? "eligible", ["eligible", "invalid-fixture"]) })),
    negativeControls: list(input.negativeControls ?? [], (e): ScorecardNegativeControl => ({ ...identity(e), violation: nullableBoolean(e.violation), qualityStatus: choice<"eligible" | "invalid-fixture">(e.qualityStatus ?? "eligible", ["eligible", "invalid-fixture"]) })),
    executions: list(input.executions, e => ({ caseId: text(e.caseId), success: boolean(e.success), fallback: nullableBoolean(e.fallback), stable: nullableBoolean(e.stable), runtimeMs: measurement(e.runtimeMs), memoryBytes: measurement(e.memoryBytes, true), aiRequests: measurement(e.aiRequests, true), aiCost: measurement(e.aiCost) })),
  };
  unique(parsed.findings); unique([...parsed.expectations, ...parsed.negativeControls ?? []]);
  if (new Set(parsed.executions.map(e => e.caseId)).size !== parsed.executions.length) throw new Error("Duplicate scorecard execution");
  const observations = [...parsed.findings, ...parsed.expectations, ...parsed.negativeControls ?? []];
  for (const entry of observations) {
    if (observations.some(other => other.caseId === entry.caseId && other.repositoryId !== entry.repositoryId)) throw new Error("Conflicting case repository identity");
  }
  return parsed;
}
function ratio(numerator: number, denominator: number): ScorecardRatio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}
/** Precision measures actionable emitted findings: duplicates and nonactionable verdicts are errors, not extra TPs. */
function metrics(findings: readonly ScorecardFinding[], expectations: readonly ScorecardExpectation[], controls: readonly ScorecardNegativeControl[]): ScorecardMetrics {
  const adjudicated = findings.filter(f => f.verdict !== "pending" && f.verdict !== "invalid-fixture");
  const actionable = adjudicated.filter(f => ["true-positive", "severity-too-high", "severity-too-low"].includes(f.verdict)).length;
  const duplicates = adjudicated.filter(f => f.verdict === "duplicate").length;
  const severityCorrect = adjudicated.filter(f => f.verdict === "true-positive").length;
  const eligibleExpectations = expectations.filter(e => e.qualityStatus !== "invalid-fixture");
  const known = eligibleExpectations.filter(e => e.detected !== null);
  const detected = known.filter(e => e.detected).length;
  const knownControls = controls.filter(c => c.qualityStatus !== "invalid-fixture" && c.violation !== null);
  const precision = ratio(actionable, adjudicated.length);
  const recall = ratio(detected, known.length);
  return {
    emittedFindings: findings.length, adjudicatedFindings: adjudicated.length,
    pendingFindings: findings.filter(f => f.verdict === "pending").length, excludedFindings: findings.filter(f => f.verdict === "invalid-fixture").length,
    pendingExpectations: eligibleExpectations.length - known.length, excludedExpectations: expectations.length - eligibleExpectations.length,
    precisionStatus: adjudicated.length === 0 ? "insufficient-evidence" : findings.some(f => f.verdict === "pending") ? "partial" : "measured", truePositives: actionable,
    falsePositives: adjudicated.filter(f => f.verdict === "false-positive").length,
    falseNegatives: known.length - detected, noiseCount: adjudicated.length - actionable + adjudicated.filter(f => f.verdict === "severity-too-high").length,
    precision, recall, f1: precision.value === null || recall.value === null ? null : precision.value + recall.value === 0 ? 0 : 2 * precision.value * recall.value / (precision.value + recall.value),
    falsePositiveRate: ratio(knownControls.filter(c => c.violation).length, knownControls.length),
    falseNegativeRate: ratio(known.length - detected, known.length), duplicateRate: ratio(duplicates, adjudicated.length),
    severityAccuracy: ratio(severityCorrect, actionable), actionabilityRate: precision,
    adjudicationCoverage: ratio(adjudicated.length, findings.length - findings.filter(f => f.verdict === "invalid-fixture").length),
  };
}
function rows(input: ScorecardInput, key: keyof ScorecardDimensions): readonly ScorecardRow[] {
  const controls = input.negativeControls ?? [];
  const keys = new Set([...input.findings, ...input.expectations, ...controls].map(e => e.dimensions[key]));
  return [...keys].sort().map(value => ({ key: value, metrics: metrics(input.findings.filter(f => f.dimensions[key] === value), input.expectations.filter(e => e.dimensions[key] === value), controls.filter(c => c.dimensions[key] === value)) }));
}
function aggregate(executions: readonly ScorecardExecution[], key: "runtimeMs" | "memoryBytes" | "aiRequests" | "aiCost", maximum = false): number | null {
  const values = executions.flatMap(e => e[key] === null ? [] : [e[key]]);
  if (values.length === 0) return null;
  const result = maximum ? Math.max(...values) : values.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(result)) throw new Error("Operational aggregate overflow");
  return result;
}
export function buildReliabilityScorecard(value: unknown): ReliabilityScorecard {
  const input = parseInput(value);
  const executions = input.executions;
  const familyRows = rows(input, "ruleFamily");
  return {
    schemaVersion: "1", datasetVersion: input.datasetVersion, reviewerVersion: input.reviewerVersion,
    summary: metrics(input.findings, input.expectations, input.negativeControls ?? []),
    dimensions: { ruleId: rows(input, "ruleId"), ruleFamily: familyRows, severity: rows(input, "severity"), provenance: rows(input, "provenance"), language: rows(input, "language"), framework: rows(input, "framework"), profile: rows(input, "profile"), repositoryCategory: rows(input, "repositoryCategory"), changeScope: rows(input, "changeScope"), findingScope: rows(input, "findingScope"), cohort: rows(input, "cohort") },
    noiseRanking: [...familyRows].sort((a, b) => b.metrics.noiseCount - a.metrics.noiseCount || a.key.localeCompare(b.key)),
    missRanking: [...familyRows].sort((a, b) => b.metrics.falseNegatives - a.metrics.falseNegatives || a.key.localeCompare(b.key)),
    operations: {
      successRate: ratio(executions.filter(e => e.success).length, executions.length), fallbackRate: ratio(executions.filter(e => e.fallback).length, executions.filter(e => e.fallback !== null).length), stability: ratio(executions.filter(e => e.stable).length, executions.filter(e => e.stable !== null).length),
      runtimeMs: aggregate(executions, "runtimeMs"), memoryBytes: aggregate(executions, "memoryBytes", true), aiRequests: aggregate(executions, "aiRequests"), aiCost: aggregate(executions, "aiCost"),
      measurementCounts: { runtimeMs: executions.filter(e => e.runtimeMs !== null).length, memoryBytes: executions.filter(e => e.memoryBytes !== null).length, aiRequests: executions.filter(e => e.aiRequests !== null).length, aiCost: executions.filter(e => e.aiCost !== null).length },
    },
  };
}
