export type ReliabilityGateStatus = "pass" | "fail" | "insufficient-evidence";

/** Measurements supplied by the trusted execution adapter, never by the reviewed repository. */
export interface OperationalReviewSample {
  readonly reviewId: string;
  readonly repositoryId: string;
  readonly observedAt: string;
  readonly success: boolean;
  readonly ruleExecutions?: number;
  readonly ruleCrashes?: number;
  readonly incrementalAttempted?: boolean;
  readonly incrementalFallback?: boolean;
  readonly providerRequests?: number;
  readonly providerFailures?: number;
  readonly apiRequests?: number;
  readonly apiFailures?: number;
  readonly durationMs?: number;
  readonly peakMemoryBytes?: number;
  readonly aiCostUsd?: number;
  readonly deterministicStable?: boolean;
}

export interface ReliabilitySloPolicy {
  readonly version: string;
  readonly minimumReviews: number;
  readonly minimumRepositories: number;
  readonly minimumSuccessRate: number;
  readonly maximumRuleCrashRate?: number;
  readonly maximumIncrementalFallbackRate?: number;
  readonly maximumProviderFailureRate?: number;
  readonly maximumApiFailureRate?: number;
  readonly maximumP95DurationMs?: number;
  readonly maximumPeakMemoryBytes?: number;
  readonly maximumMeanAiCostUsd?: number;
  readonly maximumP95DurationRegression?: number;
  readonly maximumPeakMemoryRegression?: number;
}

export interface ReliabilitySloInput {
  readonly reportVersion: string;
  readonly datasetVersion: string;
  readonly findingQualityStatus: ReliabilityGateStatus;
  readonly policy: ReliabilitySloPolicy;
  readonly samples: readonly OperationalReviewSample[];
  readonly baseline?: { readonly version: string; readonly datasetVersion: string; readonly samples: readonly OperationalReviewSample[] };
}

export interface OperationalRate {
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
}

export interface OperationalMetrics {
  readonly reviews: number;
  readonly repositories: number;
  readonly successRate: OperationalRate;
  readonly ruleCrashRate: OperationalRate;
  readonly incrementalFallbackRate: OperationalRate;
  readonly providerFailureRate: OperationalRate;
  readonly apiFailureRate: OperationalRate;
  readonly deterministicStability: OperationalRate;
  readonly latency: { readonly samples: number; readonly p50: number | null; readonly p95: number | null; readonly p99: number | null };
  readonly memory: { readonly samples: number; readonly maximum: number | null };
  readonly aiCost: { readonly samples: number; readonly total: number; readonly mean: number | null };
}

export interface ReliabilitySloReport {
  readonly schemaVersion: "1";
  readonly reportVersion: string;
  readonly datasetVersion: string;
  readonly policyVersion: string;
  readonly baselineVersion: string | null;
  readonly quantileMethod: "nearest-rank-ceil-n-times-p";
  readonly operationalStatus: ReliabilityGateStatus;
  readonly findingQualityStatus: ReliabilityGateStatus;
  readonly metrics: OperationalMetrics;
  readonly baselineMetrics: OperationalMetrics | null;
  readonly reasons: readonly string[];
}

function nonempty(value: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error("Operational scope and versions required");
}

function nonnegative(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid nonnegative operational measurement");
}

function natural(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid operational count");
}

function canonicalTimestamp(value: string): void {
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== (value.includes(".") ? value : value.replace("Z", ".000Z"))) {
    throw new Error("Operational observation requires a valid canonical UTC timestamp");
  }
}

function validatePolicy(policy: ReliabilitySloPolicy): void {
  nonempty(policy.version);
  [policy.minimumReviews, policy.minimumRepositories].forEach(value => {
    natural(value);
    if (value === 0) throw new Error("Operational sample minima must be positive");
  });
  for (const value of [policy.minimumSuccessRate, policy.maximumRuleCrashRate, policy.maximumIncrementalFallbackRate,
    policy.maximumProviderFailureRate, policy.maximumApiFailureRate]) {
    if (value !== undefined) {
      nonnegative(value);
      if (value > 1) throw new Error("Operational rates must be at most one");
    }
  }
  [policy.maximumP95DurationMs, policy.maximumPeakMemoryBytes, policy.maximumMeanAiCostUsd,
    policy.maximumP95DurationRegression, policy.maximumPeakMemoryRegression].forEach(value => {
    if (value !== undefined) nonnegative(value);
  });
}

function validateSamples(samples: readonly OperationalReviewSample[]): void {
  if (new Set(samples.map(sample => sample.reviewId)).size !== samples.length) throw new Error("Duplicate operational review identity");
  for (const sample of samples) {
    [sample.reviewId, sample.repositoryId, sample.observedAt].forEach(nonempty);
    canonicalTimestamp(sample.observedAt);
    if (typeof sample.success !== "boolean") throw new Error("Operational success must be boolean");
    for (const [total, failed] of [[sample.ruleExecutions, sample.ruleCrashes],
      [sample.providerRequests, sample.providerFailures], [sample.apiRequests, sample.apiFailures]]) {
      if ((total === undefined) !== (failed === undefined)) throw new Error("Operational counter requires its denominator");
      if (total !== undefined && failed !== undefined) {
        natural(total); natural(failed);
        if (failed > total) throw new Error("Operational failures exceed attempted work");
      }
    }
    if ((sample.incrementalAttempted === undefined) !== (sample.incrementalFallback === undefined)) throw new Error("Incremental fallback requires attempted-state measurement");
    if (sample.incrementalAttempted !== undefined && (typeof sample.incrementalAttempted !== "boolean"
      || typeof sample.incrementalFallback !== "boolean" || (!sample.incrementalAttempted && sample.incrementalFallback))) throw new Error("Invalid incremental state");
    if (sample.deterministicStable !== undefined && typeof sample.deterministicStable !== "boolean") throw new Error("Invalid stability measurement");
    [sample.durationMs, sample.peakMemoryBytes, sample.aiCostUsd].forEach(value => {
      if (value !== undefined) nonnegative(value);
    });
  }
}

function rate(numerator: number, denominator: number): OperationalRate {
  natural(numerator); natural(denominator);
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function counterRate(samples: readonly OperationalReviewSample[], total: "ruleExecutions" | "providerRequests" | "apiRequests",
  failed: "ruleCrashes" | "providerFailures" | "apiFailures"): OperationalRate {
  return rate(samples.reduce((sum, sample) => sum + (sample[failed] ?? 0), 0),
    samples.reduce((sum, sample) => sum + (sample[total] ?? 0), 0));
}

function quantile(sorted: readonly number[], probability: number): number | null {
  return sorted.length === 0 ? null : sorted[Math.ceil(sorted.length * probability) - 1] ?? null;
}

function metrics(samples: readonly OperationalReviewSample[]): OperationalMetrics {
  const latency = samples.flatMap(sample => sample.durationMs === undefined ? [] : [sample.durationMs]).sort((a, b) => a - b);
  const memory = samples.flatMap(sample => sample.peakMemoryBytes === undefined ? [] : [sample.peakMemoryBytes]);
  const costs = samples.flatMap(sample => sample.aiCostUsd === undefined ? [] : [sample.aiCostUsd]);
  const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
  nonnegative(totalCost);
  return {
    reviews: samples.length, repositories: new Set(samples.map(sample => sample.repositoryId)).size,
    successRate: rate(samples.filter(sample => sample.success).length, samples.length),
    ruleCrashRate: counterRate(samples, "ruleExecutions", "ruleCrashes"),
    incrementalFallbackRate: rate(samples.filter(sample => sample.incrementalFallback).length, samples.filter(sample => sample.incrementalAttempted).length),
    providerFailureRate: counterRate(samples, "providerRequests", "providerFailures"),
    apiFailureRate: counterRate(samples, "apiRequests", "apiFailures"),
    deterministicStability: rate(samples.filter(sample => sample.deterministicStable === true).length,
      samples.filter(sample => sample.deterministicStable !== undefined).length),
    latency: { samples: latency.length, p50: quantile(latency, 0.5), p95: quantile(latency, 0.95), p99: quantile(latency, 0.99) },
    memory: { samples: memory.length, maximum: memory.length === 0 ? null : memory.reduce((max, value) => Math.max(max, value), 0) },
    aiCost: { samples: costs.length, total: totalCost, mean: costs.length === 0 ? null : totalCost / costs.length },
  };
}

function sampleReasons(values: OperationalMetrics, policy: ReliabilitySloPolicy, samples: readonly OperationalReviewSample[]): readonly string[] {
  const required: readonly (readonly [boolean, number, string])[] = [
    [true, values.deterministicStability.denominator, "stability"],
    [policy.maximumRuleCrashRate !== undefined, samples.filter(sample => sample.ruleExecutions !== undefined).length, "rule crashes"],
    [policy.maximumIncrementalFallbackRate !== undefined, samples.filter(sample => sample.incrementalAttempted !== undefined).length, "incremental fallback"],
    [policy.maximumProviderFailureRate !== undefined, samples.filter(sample => sample.providerRequests !== undefined).length, "provider failures"],
    [policy.maximumApiFailureRate !== undefined, samples.filter(sample => sample.apiRequests !== undefined).length, "API failures"],
    [policy.maximumP95DurationMs !== undefined || policy.maximumP95DurationRegression !== undefined, values.latency.samples, "latency"],
    [policy.maximumPeakMemoryBytes !== undefined || policy.maximumPeakMemoryRegression !== undefined, values.memory.samples, "memory"],
    [policy.maximumMeanAiCostUsd !== undefined, values.aiCost.samples, "AI cost"],
  ];
  return [
    ...(values.reviews < policy.minimumReviews ? ["Insufficient independent review samples"] : []),
    ...(values.repositories < policy.minimumRepositories ? ["Insufficient independent repositories"] : []),
    ...required.flatMap(([enabled, count, label]) => enabled && count < values.reviews ? [`Incomplete ${label} measurements`] : []),
    ...required.flatMap(([enabled, count, label]) => enabled && count < policy.minimumReviews ? [`Insufficient ${label} samples`] : []),
  ];
}

function budgetChecks(values: OperationalMetrics, policy: ReliabilitySloPolicy): readonly (readonly [number | null, number | undefined, string])[] {
  return [
    [values.ruleCrashRate.value, policy.maximumRuleCrashRate, "Rule crash rate exceeds SLO"],
    [values.incrementalFallbackRate.value, policy.maximumIncrementalFallbackRate, "Incremental fallback rate exceeds SLO"],
    [values.providerFailureRate.value, policy.maximumProviderFailureRate, "Provider failure rate exceeds SLO"],
    [values.apiFailureRate.value, policy.maximumApiFailureRate, "API failure rate exceeds SLO"],
    [values.latency.p95, policy.maximumP95DurationMs, "P95 latency exceeds SLO"],
    [values.memory.maximum, policy.maximumPeakMemoryBytes, "Peak memory exceeds SLO"],
    [values.aiCost.mean, policy.maximumMeanAiCostUsd, "Mean AI cost exceeds SLO"],
  ];
}

function attemptReasons(samples: readonly OperationalReviewSample[], policy: ReliabilitySloPolicy): readonly string[] {
  const attempts: readonly (readonly [boolean, readonly OperationalReviewSample[], string])[] = [
    [policy.maximumRuleCrashRate !== undefined, samples.filter(sample => (sample.ruleExecutions ?? 0) > 0), "rule"],
    [policy.maximumIncrementalFallbackRate !== undefined, samples.filter(sample => sample.incrementalAttempted), "incremental"],
    [policy.maximumProviderFailureRate !== undefined, samples.filter(sample => (sample.providerRequests ?? 0) > 0), "provider"],
    [policy.maximumApiFailureRate !== undefined, samples.filter(sample => (sample.apiRequests ?? 0) > 0), "API"],
  ];
  return attempts.flatMap(([enabled, reviews, label]) => !enabled ? [] : [
    ...(reviews.length < policy.minimumReviews ? [`Insufficient ${label} attempt samples`] : []),
    ...(new Set(reviews.map(review => review.repositoryId)).size < policy.minimumRepositories
      ? [`Insufficient independent ${label} attempt repositories`] : []),
  ]);
}

function regressionReasons(values: OperationalMetrics, baseline: OperationalMetrics, policy: ReliabilitySloPolicy): readonly string[] {
  const pairs: readonly (readonly [number | null, number | null, number | undefined, string])[] = [
    [values.latency.p95, baseline.latency.p95, policy.maximumP95DurationRegression, "P95 latency regressed against baseline"],
    [values.memory.maximum, baseline.memory.maximum, policy.maximumPeakMemoryRegression, "Peak memory regressed against baseline"],
  ];
  return [
    ...pairs.flatMap(([current, previous, budget, reason]) => budget !== undefined && current !== null
      && previous !== null && current > previous * (1 + budget) ? [reason] : []),
    ...(values.successRate.value !== null && baseline.successRate.value !== null
      && values.successRate.value < baseline.successRate.value ? ["Review success regressed against baseline"] : []),
    ...(["ruleCrashRate", "providerFailureRate", "apiFailureRate"] as const).flatMap(key => {
      const current = values[key].value; const previous = baseline[key].value;
      return current !== null && previous !== null && current > previous ? [`${key} regressed against baseline`] : [];
    }),
  ];
}

export function buildReliabilitySloReport(input: ReliabilitySloInput): ReliabilitySloReport {
  [input.reportVersion, input.datasetVersion].forEach(nonempty);
  if (!["pass", "fail", "insufficient-evidence"].includes(input.findingQualityStatus)) throw new Error("Invalid finding quality status");
  validatePolicy(input.policy); validateSamples(input.samples);
  if (input.baseline) {
    nonempty(input.baseline.version); nonempty(input.baseline.datasetVersion);
    if (input.baseline.datasetVersion !== input.datasetVersion) throw new Error("Operational baseline dataset mismatch");
    validateSamples(input.baseline.samples);
    const candidateIds = input.samples.map(sample => `${sample.reviewId}:${sample.repositoryId}:${sample.observedAt}`).sort();
    const baselineIds = input.baseline.samples.map(sample => `${sample.reviewId}:${sample.repositoryId}:${sample.observedAt}`).sort();
    if (JSON.stringify(candidateIds) !== JSON.stringify(baselineIds)) throw new Error("Operational baseline must cover identical review contexts");
  }
  const values = metrics(input.samples);
  const baselineMetrics = input.baseline ? metrics(input.baseline.samples) : null;
  const checks = budgetChecks(values, input.policy);
  const insufficient = [...sampleReasons(values, input.policy, input.samples), ...attemptReasons(input.samples, input.policy),
    ...(!input.baseline && (input.policy.maximumP95DurationRegression !== undefined || input.policy.maximumPeakMemoryRegression !== undefined)
      ? ["Versioned baseline required for configured regression budgets"] : []),
    ...checks.flatMap(([value, budget, reason]) => budget !== undefined && value === null ? [`Missing denominator: ${reason}`] : []),
    ...(baselineMetrics && input.baseline ? [...sampleReasons(baselineMetrics, input.policy, input.baseline.samples),
      ...attemptReasons(input.baseline.samples, input.policy)].map(reason => `Baseline: ${reason}`) : [])];
  const failures = [
    ...(values.successRate.value !== null && values.successRate.value < input.policy.minimumSuccessRate ? ["Review success below SLO"] : []),
    ...(values.deterministicStability.value !== null && values.deterministicStability.value < 1 ? ["Deterministic stability below 100%"] : []),
    ...checks.flatMap(([value, budget, reason]) => budget !== undefined && value !== null && value > budget ? [reason] : []),
    ...(baselineMetrics ? regressionReasons(values, baselineMetrics, input.policy) : []),
  ];
  return {
    schemaVersion: "1", reportVersion: input.reportVersion, datasetVersion: input.datasetVersion, policyVersion: input.policy.version,
    baselineVersion: input.baseline?.version ?? null, quantileMethod: "nearest-rank-ceil-n-times-p",
    operationalStatus: failures.length > 0 ? "fail" : insufficient.length > 0 ? "insufficient-evidence" : "pass",
    findingQualityStatus: input.findingQualityStatus, metrics: values, baselineMetrics, reasons: [...failures, ...insufficient],
  };
}

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected operational input object");
  const entries = Object.entries(value);
  if (entries.some(([key]) => !allowed.includes(key))) throw new Error("Unknown operational input field");
  return Object.fromEntries(entries);
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected operational input string");
  nonempty(value);
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number") throw new Error("Expected operational input number");
  nonnegative(value);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : number(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected operational input boolean");
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return value === undefined ? undefined : boolean(value);
}

function parseSample(value: unknown): OperationalReviewSample {
  const sample = object(value, ["reviewId", "repositoryId", "observedAt", "success", "ruleExecutions", "ruleCrashes",
    "incrementalAttempted", "incrementalFallback", "providerRequests", "providerFailures", "apiRequests", "apiFailures",
    "durationMs", "peakMemoryBytes", "aiCostUsd", "deterministicStable"]);
  return {
    reviewId: string(sample.reviewId), repositoryId: string(sample.repositoryId), observedAt: string(sample.observedAt),
    success: boolean(sample.success), ruleExecutions: optionalNumber(sample.ruleExecutions), ruleCrashes: optionalNumber(sample.ruleCrashes),
    incrementalAttempted: optionalBoolean(sample.incrementalAttempted), incrementalFallback: optionalBoolean(sample.incrementalFallback),
    providerRequests: optionalNumber(sample.providerRequests), providerFailures: optionalNumber(sample.providerFailures),
    apiRequests: optionalNumber(sample.apiRequests), apiFailures: optionalNumber(sample.apiFailures),
    durationMs: optionalNumber(sample.durationMs), peakMemoryBytes: optionalNumber(sample.peakMemoryBytes),
    aiCostUsd: optionalNumber(sample.aiCostUsd), deterministicStable: optionalBoolean(sample.deterministicStable),
  };
}

function parseSamples(value: unknown): readonly OperationalReviewSample[] {
  if (!Array.isArray(value)) throw new Error("Expected operational sample array");
  return value.map((entry: unknown) => parseSample(entry));
}

function parsePolicy(value: unknown): ReliabilitySloPolicy {
  const policy = object(value, ["version", "minimumReviews", "minimumRepositories", "minimumSuccessRate", "maximumRuleCrashRate",
    "maximumIncrementalFallbackRate", "maximumProviderFailureRate", "maximumApiFailureRate", "maximumP95DurationMs",
    "maximumPeakMemoryBytes", "maximumMeanAiCostUsd", "maximumP95DurationRegression", "maximumPeakMemoryRegression"]);
  return {
    version: string(policy.version), minimumReviews: number(policy.minimumReviews), minimumRepositories: number(policy.minimumRepositories),
    minimumSuccessRate: number(policy.minimumSuccessRate), maximumRuleCrashRate: optionalNumber(policy.maximumRuleCrashRate),
    maximumIncrementalFallbackRate: optionalNumber(policy.maximumIncrementalFallbackRate),
    maximumProviderFailureRate: optionalNumber(policy.maximumProviderFailureRate), maximumApiFailureRate: optionalNumber(policy.maximumApiFailureRate),
    maximumP95DurationMs: optionalNumber(policy.maximumP95DurationMs), maximumPeakMemoryBytes: optionalNumber(policy.maximumPeakMemoryBytes),
    maximumMeanAiCostUsd: optionalNumber(policy.maximumMeanAiCostUsd), maximumP95DurationRegression: optionalNumber(policy.maximumP95DurationRegression),
    maximumPeakMemoryRegression: optionalNumber(policy.maximumPeakMemoryRegression),
  };
}

/** Narrow untrusted CLI JSON, rejecting unknown policy options, then run all cross-field validation. */
export function parseReliabilitySloInput(value: unknown): ReliabilitySloInput {
  const input = object(value, ["reportVersion", "datasetVersion", "findingQualityStatus", "policy", "samples", "baseline"]);
  const quality = input.findingQualityStatus;
  if (quality !== "pass" && quality !== "fail" && quality !== "insufficient-evidence") throw new Error("Invalid finding quality status");
  const baseline = input.baseline === undefined ? undefined : object(input.baseline, ["version", "datasetVersion", "samples"]);
  const parsed: ReliabilitySloInput = {
    reportVersion: string(input.reportVersion), datasetVersion: string(input.datasetVersion), findingQualityStatus: quality,
    policy: parsePolicy(input.policy), samples: parseSamples(input.samples),
    baseline: baseline ? { version: string(baseline.version), datasetVersion: string(baseline.datasetVersion), samples: parseSamples(baseline.samples) } : undefined,
  };
  buildReliabilitySloReport(parsed);
  return parsed;
}
