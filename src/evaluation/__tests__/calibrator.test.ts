import { describe, expect, it } from "vitest";
import { fitEmpiricalCalibrator, predictEmpiricalProbability } from "../calibrator";
import type { CalibrationLabelVerificationPort } from "../calibrator";

const manifest = { schemaVersion: "1", manifestId: "cohort-v1", development: [{ caseId: "dev", repositoryId: "dev", observedAt: "2024-01-01T00:00:00.000Z" }], calibration: [{ caseId: "cal-a", repositoryId: "repo-a", observedAt: "2024-02-01T00:00:00.000Z" }, { caseId: "cal-b", repositoryId: "repo-b", observedAt: "2024-02-02T00:00:00.000Z" }], protectedHoldout: [{ caseId: "holdout", repositoryId: "holdout", observedAt: "2024-03-01T00:00:00.000Z" }] };
const feature = { ruleFamily: "security", profile: "app", provenance: "deterministic", rawConfidence: 1, detectionCertainty: 1 };
const input = { candidateId: "candidate-v1", modelVersion: "calibrator-v1", datasetVersion: "truth-v1", manifest, binCount: 5, minimumSamples: 2, minimumRepositories: 2, samples: manifest.calibration.map(c => ({ ...c, id: `${c.caseId}:finding`, ...feature, adjudicationRef: `label:${c.caseId}`, sourceRef: `source:${c.caseId}` })) };
const verifier: CalibrationLabelVerificationPort = { async verify(sample) { return { label: sample.caseId === "cal-a" ? "correct" : "incorrect", adjudicationRef: sample.adjudicationRef, sourceRef: sample.sourceRef }; } };

describe("empirical confidence calibrator", () => {
  it("fits verified calibration cohort only and preserves detector certainty", async () => {
    const model = await fitEmpiricalCalibrator(input, verifier);
    const prediction = predictEmpiricalProbability(model, feature);
    expect(prediction.probability).toBe(0.5);
    expect(prediction.samples).toBe(2);
    expect(prediction.repositories).toBe(2);
    expect(prediction.detectionCertainty).toBe(1);
    expect(prediction.rawConfidence).toBe(1);
    expect(prediction.basis).toBe("empirical-bin-laplace");
    expect(model.trainingExposure.caseIds).toEqual(["cal-a", "cal-b"]);
    expect(model.trainingExposure.repositoryIds).not.toContain("holdout");
  });
  it("returns explicit sparse results without using raw score as probability", async () => {
    const model = await fitEmpiricalCalibrator({ ...input, minimumSamples: 3 }, verifier);
    expect(predictEmpiricalProbability(model, feature).probability).toBeNull();
    expect(predictEmpiricalProbability(model, { ...feature, rawConfidence: 0.2 }).basis).toBe("insufficient-evidence");
    expect(predictEmpiricalProbability(model, { ...feature, provenance: "ai" }).probability).toBeNull();
  });
  it("requires independent repositories despite many same-repository findings", async () => {
    const one = { ...input, manifest: { ...manifest, calibration: manifest.calibration.map(c => ({ ...c, repositoryId: "one" })) }, samples: input.samples.map(c => ({ ...c, repositoryId: "one" })) };
    const model = await fitEmpiricalCalibrator(one, verifier);
    expect(predictEmpiricalProbability(model, feature).probability).toBeNull();
  });
  it("rejects held-out, omitted, mismatched, and duplicate sample references", async () => {
    for (const samples of [[input.samples[0]], [input.samples[0], input.samples[0]], input.samples.map(s => ({ ...s, caseId: "holdout" })), input.samples.map(s => ({ ...s, observedAt: "2024-01-01T00:00:00.000Z" }))]) await expect(fitEmpiricalCalibrator({ ...input, samples }, verifier)).rejects.toThrow();
  });
  it("requires trusted canonical labels and matching evidence refs", async () => {
    await expect(fitEmpiricalCalibrator(input, { async verify() { return { label: "pending", adjudicationRef: "pending", sourceRef: "source" }; } })).rejects.toThrow();
    await expect(fitEmpiricalCalibrator(input, { async verify(s) { return { label: "correct", adjudicationRef: "other", sourceRef: s.sourceRef }; } })).rejects.toThrow();
  });
  it("smooths empirical successes without returning certainty one", async () => {
    const model = await fitEmpiricalCalibrator(input, { async verify(s) { return { label: "correct", sourceRef: s.sourceRef, adjudicationRef: s.adjudicationRef }; } });
    expect(predictEmpiricalProbability(model, feature).probability).toBe(0.75);
  });
  it("rejects persisted models with false exposure or duplicated bin provenance", async () => {
    const model = await fitEmpiricalCalibrator(input, verifier);
    for (const bad of [{ ...model, trainingExposure: { ...model.trainingExposure, trainedThrough: "2024-02-01T00:00:00.000Z" } }, { ...model, bins: [...model.bins, ...model.bins] }, { ...model, bins: model.bins.map(b => ({ ...b, repositoryIds: ["holdout"] })) }, { ...model, trainingExposure: { ...model.trainingExposure, caseIds: ["cal-a"] } }]) expect(() => predictEmpiricalProbability(bad, feature)).toThrow();
  });
  it("rejects invalid input features, samples and model statistics", async () => {
    for (const bad of [null, { ...input, binCount: 0 }, { ...input, samples: input.samples.map(s => ({ ...s, rawConfidence: NaN })) }, { ...input, samples: input.samples.map(s => ({ ...s, detectionCertainty: 2 })) }]) await expect(fitEmpiricalCalibrator(bad, verifier)).rejects.toThrow();
    const model = await fitEmpiricalCalibrator(input, verifier);
    expect(() => predictEmpiricalProbability(model, { ...feature, rawConfidence: -1 })).toThrow();
    expect(() => predictEmpiricalProbability({ ...model, bins: model.bins.map(b => ({ ...b, correct: b.samples + 1 })) }, feature)).toThrow();
  });
});
