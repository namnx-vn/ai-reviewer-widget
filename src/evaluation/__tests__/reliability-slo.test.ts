import { describe, expect, it } from "vitest";
import { buildReliabilitySloReport, parseReliabilitySloInput, type ReliabilitySloInput, type OperationalReviewSample } from "../reliability-slo";

function samples(): readonly OperationalReviewSample[] {
  return Array.from({ length: 20 }, (_, i) => ({
    reviewId: `review-${i}`, repositoryId: `repo-${i}`, observedAt: "2026-09-15T00:00:00Z",
    success: true, ruleExecutions: 10, ruleCrashes: 0, incrementalAttempted: true, incrementalFallback: false,
    providerRequests: 2, providerFailures: 0, apiRequests: 3, apiFailures: 0,
    durationMs: i + 1, peakMemoryBytes: 100, aiCostUsd: 0.01, deterministicStable: true,
  }));
}

function input(): ReliabilitySloInput {
  return { reportVersion: "candidate-1", datasetVersion: "operations-1", findingQualityStatus: "insufficient-evidence",
    samples: samples(), policy: { version: "slo-1", minimumReviews: 20, minimumRepositories: 10,
      minimumSuccessRate: 0.99, maximumRuleCrashRate: 0, maximumIncrementalFallbackRate: 0.1,
      maximumProviderFailureRate: 0.05, maximumApiFailureRate: 0.05,
      maximumP95DurationMs: 30, maximumPeakMemoryBytes: 200, maximumMeanAiCostUsd: 0.02,
    },
  };
}

describe("operational reliability SLO", () => {
  it("reports nearest-rank percentiles and keeps operational success separate from finding quality", () => {
    const report = buildReliabilitySloReport(input());
    expect(report.operationalStatus).toBe("pass");
    expect(report.findingQualityStatus).toBe("insufficient-evidence");
    expect(report.metrics.latency).toEqual({ samples: 20, p50: 10, p95: 19, p99: 20 });
    expect(report.metrics.providerFailureRate).toEqual({ numerator: 0, denominator: 40, value: 0 });
    expect(report.metrics.deterministicStability.value).toBe(1);
  });

  it("does not convert missing measurements or a single repeated repository into a passing SLO", () => {
    const original = input();
    const sparse = original.samples.map(sample => ({ ...sample, durationMs: undefined, repositoryId: "only-one" }));
    const report = buildReliabilitySloReport({ ...original, samples: sparse });
    expect(report.operationalStatus).toBe("insufficient-evidence");
    expect(report.metrics.latency.p95).toBeNull();
    expect(report.metrics.latency.samples).toBe(0);
    expect(report.reasons).toContain("Insufficient independent repositories");
  });

  it("requires independent samples that actually invoke the configured provider", () => {
    const original = input();
    const report = buildReliabilitySloReport({ ...original, samples: original.samples.map((sample, i) => ({
      ...sample, providerRequests: i === 0 ? 2 : 0, providerFailures: 0,
    })) });
    expect(report.operationalStatus).toBe("insufficient-evidence");
    expect(report.reasons).toContain("Insufficient provider attempt samples");
  });

  it("uses observed request denominators and fails known crashes, fallback, API/provider errors and instability", () => {
    const original = input();
    const failing = original.samples.map((sample, i) => i === 0 ? { ...sample,
      success: false, ruleCrashes: 1, apiFailures: 3, providerFailures: 2, deterministicStable: false,
    } : sample);
    const report = buildReliabilitySloReport({ ...original, samples: failing });
    expect(report.operationalStatus).toBe("fail");
    expect(report.reasons).toContain("Deterministic stability below 100%");
    expect(report.metrics.ruleCrashRate.value).toBe(1 / 200);
    const fallbacks = original.samples.map(sample => ({ ...sample, incrementalFallback: true }));
    expect(buildReliabilitySloReport({ ...original, samples: fallbacks }).operationalStatus).toBe("fail");
  });

  it("enforces versioned baseline performance regression budgets", () => {
    const original = input();
    const baseline = { version: "production-4", datasetVersion: "operations-1", samples: original.samples };
    const candidate = original.samples.map(sample => ({ ...sample, durationMs: sample.durationMs! * 1.2 }));
    const report = buildReliabilitySloReport({ ...original, samples: candidate, baseline,
      policy: { ...original.policy, maximumP95DurationRegression: 0.1, maximumPeakMemoryRegression: 0.1 },
    });
    expect(report.operationalStatus).toBe("fail");
    expect(report.baselineVersion).toBe("production-4");
    expect(report.reasons).toContain("P95 latency regressed against baseline");
    expect(() => buildReliabilitySloReport({ ...original, baseline: { ...baseline, datasetVersion: "different" } })).toThrow();
  });

  it("never claims provider success when no provider calls were observed", () => {
    const original = input();
    const report = buildReliabilitySloReport({ ...original,
      samples: original.samples.map(sample => ({ ...sample, providerRequests: 0, providerFailures: 0 })),
    });
    expect(report.metrics.providerFailureRate.value).toBeNull();
    expect(report.operationalStatus).toBe("insufficient-evidence");
  });

  it("rejects duplicated review identities, impossible counts and nonfinite costs", () => {
    const original = input();
    expect(() => buildReliabilitySloReport({ ...original, samples: [original.samples[0]!, original.samples[0]!] })).toThrow();
    expect(() => buildReliabilitySloReport({ ...original, samples: [{ ...original.samples[0]!, apiFailures: 99 }] })).toThrow();
    expect(() => buildReliabilitySloReport({ ...original, samples: [{ ...original.samples[0]!, aiCostUsd: Infinity }] })).toThrow();
  });

  it("strictly parses external SLO JSON and rejects unknown options or mistyped measurements", () => {
    expect(buildReliabilitySloReport(parseReliabilitySloInput(JSON.parse(JSON.stringify(input())))).operationalStatus).toBe("pass");
    expect(() => parseReliabilitySloInput({ ...input(), extra: "ignored?" })).toThrow();
    expect(() => parseReliabilitySloInput({ ...input(), policy: { ...input().policy, maximumCrashRate: 1 } })).toThrow();
    expect(() => parseReliabilitySloInput({ ...input(), samples: [{ ...samples()[0], success: "true" }] })).toThrow();
    expect(() => parseReliabilitySloInput({ ...input(), samples: [{ ...samples()[0], durationMs: "20" }] })).toThrow();
    expect(() => parseReliabilitySloInput(null)).toThrow();
  });

  it("rejects timestamps that normalize an impossible calendar date", () => {
    expect(() => buildReliabilitySloReport({ ...input(), samples: [{ ...samples()[0]!, observedAt: "2026-02-30T00:00:00Z" }] })).toThrow();
  });

  it("reports configured regression gates without a baseline as insufficient evidence", () => {
    const original = input();
    const report = buildReliabilitySloReport({ ...original,
      policy: { ...original.policy, maximumP95DurationRegression: 0.1 },
    });
    expect(report.operationalStatus).toBe("insufficient-evidence");
    expect(report.reasons).toContain("Versioned baseline required for configured regression budgets");
  });

  it("parses versioned paired baselines and validates optional policy thresholds", () => {
    const original = input();
    const paired = { ...original, baseline: { version: "production-4", datasetVersion: original.datasetVersion, samples: original.samples } };
    expect(buildReliabilitySloReport(parseReliabilitySloInput(paired)).operationalStatus).toBe("pass");
    expect(() => parseReliabilitySloInput({ ...paired, baseline: { ...paired.baseline, samples: [] } })).toThrow();
    expect(() => parseReliabilitySloInput({ ...original, policy: { ...original.policy, maximumProviderFailureRate: 2 } })).toThrow();
    expect(() => parseReliabilitySloInput({ ...original, samples: [{ ...original.samples[0], incrementalAttempted: false, incrementalFallback: true }] })).toThrow();
  });
});
