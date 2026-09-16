import { describe, expect, it } from "vitest";
import { buildCalibrationReport, compareCalibrationReports } from "../calibration";

const sample = { id: "a", repositoryId: "repo-a", ruleFamily: "react", profile: "app", rawConfidence: 1, detectionCertainty: 1, calibratedProbability: 0.8, label: "correct" };
const input = { modelVersion: "cal-v1", datasetVersion: "truth-v1", binCount: 5, samples: [sample, { ...sample, id: "b", repositoryId: "repo-b", calibratedProbability: 0.2, label: "incorrect" }] };
const policy = { policyVersion: "gate-v1", minimumSamples: 2, minimumRepositories: 2, maximumBrierScore: 0.1, maximumEce: 0.3, maximumBrierRegression: 0, maximumEceRegression: 0, protectedGroups: [{ dimension: "ruleFamily", key: "react" }] };

describe("calibration evaluation", () => {
  it("computes Brier, ECE and reliability buckets only from calibrated probabilities", () => {
    const report = buildCalibrationReport(input);
    expect(report.summary.brierScore).toBeCloseTo(0.04);
    expect(report.summary.ece).toBeCloseTo(0.2);
    expect(report.summary.buckets[4].empiricalAccuracy).toBe(1);
    expect(report.summary.buckets[0].empiricalAccuracy).toBeNull();
    expect(compareCalibrationReports(report, report, policy).status).toBe("pass");
  });
  it("separates deterministic certainty and raw LLM confidence from empirical correctness", () => {
    const report = buildCalibrationReport({ ...input, samples: [{ ...sample, calibratedProbability: null }] });
    expect(report.summary.brierScore).toBeNull();
    expect(report.summary.missingProbabilities).toBe(1);
    expect(compareCalibrationReports(report, report, policy).status).toBe("insufficient-evidence");
  });
  it("does not learn from pending and excluded verdicts", () => {
    const report = buildCalibrationReport({ ...input, samples: [{ ...sample, label: "pending" }, { ...sample, id: "b", label: "excluded" }] });
    expect(report.summary.evaluatedSamples).toBe(0);
    expect(report.summary.pendingSamples).toBe(1);
    expect(report.summary.excludedSamples).toBe(1);
    expect(report.summary.brierScore).toBeNull();
  });
  it("gates worsening calibration and rejects absent protected subgroup evidence", () => {
    const baseline = buildCalibrationReport(input);
    const current = buildCalibrationReport({ ...input, modelVersion: "cal-v2", samples: input.samples.map(s => ({ ...s, calibratedProbability: 0.5 })) });
    expect(compareCalibrationReports(current, baseline, policy).status).toBe("fail");
    expect(compareCalibrationReports(baseline, baseline, { ...policy, protectedGroups: [{ dimension: "profile", key: "missing" }] }).status).toBe("insufficient-evidence");
    expect(compareCalibrationReports(baseline, { ...baseline, datasetVersion: "different" }, policy).status).toBe("insufficient-evidence");
  });
  it("includes endpoint probabilities in valid buckets and compares profile drift", () => {
    const report = buildCalibrationReport({ ...input, samples: [{ ...sample, calibratedProbability: 1 }, { ...input.samples[1], calibratedProbability: 0 }] });
    expect(report.summary.brierScore).toBe(0);
    expect(report.summary.ece).toBe(0);
    expect(report.summary.buckets[0].samples).toBe(1);
    expect(report.summary.buckets[4].samples).toBe(1);
    expect(compareCalibrationReports(report, report, { ...policy, protectedGroups: [{ dimension: "profile", key: "app" }] }).status).toBe("pass");
    const differentSamples = buildCalibrationReport({ ...input, samples: input.samples.map(s => ({ ...s, id: `different-${s.id}` })) });
    expect(compareCalibrationReports(report, differentSamples, policy).status).toBe("insufficient-evidence");
  });
  it("rejects fabricated reports and policy metadata at the external comparison boundary", () => {
    const report = buildCalibrationReport(input);
    for (const bad of [null, { ...report, summary: { ...report.summary, brierScore: NaN } }, { ...report, summary: { ...report.summary, repositories: 100 } }, { ...report, summary: { ...report.summary, buckets: [] } }, { ...report, groups: { ...report.groups, ruleFamily: [...report.groups.ruleFamily, report.groups.ruleFamily[0]] } }]) expect(() => compareCalibrationReports(bad, report, policy)).toThrow();
    for (const bad of [{ ...policy, maximumEce: null }, { ...policy, protectedGroups: [{ dimension: "unknown", key: "react" }] }, { ...policy, protectedGroups: null }]) expect(() => compareCalibrationReports(report, report, bad)).toThrow();
    for (const bad of [{ ...input, modelVersion: "" }, { ...input, samples: null }, { ...input, samples: [null] }, { ...input, samples: [{ ...sample, label: "unverified" }] }]) expect(() => buildCalibrationReport(bad)).toThrow();
  });
  it("rejects invalid probabilities, bins, duplicate ids and policy numbers", () => {
    for (const bad of [null, { ...input, binCount: 0 }, { ...input, samples: [sample, sample] }, { ...input, samples: [{ ...sample, rawConfidence: NaN }] }, { ...input, samples: [{ ...sample, calibratedProbability: 1.1 }] }]) expect(() => buildCalibrationReport(bad)).toThrow();
    const report = buildCalibrationReport(input);
    expect(() => compareCalibrationReports(report, report, { ...policy, minimumSamples: 0 })).toThrow();
  });
});
