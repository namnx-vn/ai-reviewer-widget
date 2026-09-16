import { assertCandidateHoldoutIsolation, validateHoldoutManifest } from "./holdout";
import type { CandidateTrainingExposure, HoldoutManifest } from "./holdout";

export interface CalibrationFeatures {
  ruleFamily: string;
  profile: string;
  provenance: "deterministic" | "ai";
  rawConfidence: number;
  detectionCertainty: number | null;
}
export interface EmpiricalTrainingSample extends CalibrationFeatures {
  id: string;
  caseId: string;
  repositoryId: string;
  observedAt: string;
  adjudicationRef: string;
  sourceRef: string;
}
export interface VerifiedCalibrationLabel {
  label: "correct" | "incorrect" | "pending" | "excluded";
  adjudicationRef: string;
  sourceRef: string;
}
/** Adapter must resolve persisted adjudication/source refs; raw feedback acceptance and self-confidence are not truth. */
export interface CalibrationLabelVerificationPort {
  verify(sample: EmpiricalTrainingSample): Promise<VerifiedCalibrationLabel>;
}
export interface EmpiricalCalibratorInput {
  candidateId: string;
  modelVersion: string;
  datasetVersion: string;
  manifest: HoldoutManifest;
  binCount: number;
  minimumSamples: number;
  minimumRepositories: number;
  samples: readonly EmpiricalTrainingSample[];
}
export interface EmpiricalCalibrationBin {
  ruleFamily: string;
  profile: string;
  provenance: "deterministic" | "ai";
  bin: number;
  samples: number;
  correct: number;
  repositoryIds: readonly string[];
}
export interface EmpiricalCalibratorModel {
  schemaVersion: "1";
  candidateId: string;
  modelVersion: string;
  datasetVersion: string;
  manifest: HoldoutManifest;
  binCount: number;
  minimumSamples: number;
  minimumRepositories: number;
  smoothing: "laplace-add-one";
  trainingExposure: CandidateTrainingExposure;
  trainingRefs: readonly { sampleId: string; caseId: string; adjudicationRef: string; sourceRef: string }[];
  bins: readonly EmpiricalCalibrationBin[];
}
export interface EmpiricalPrediction extends CalibrationFeatures {
  modelVersion: string;
  probability: number | null;
  basis: "empirical-bin-laplace" | "insufficient-evidence";
  samples: number;
  repositories: number;
  correct: number;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected calibrator object");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) throw new Error("Expected canonical calibrator identifier");
  return value;
}
function natural(value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("Invalid calibrator count");
  return value;
}
function probability(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid calibrator feature probability");
  return value;
}
function provenance(value: unknown): CalibrationFeatures["provenance"] {
  if (value !== "deterministic" && value !== "ai") throw new Error("Invalid calibrator feature provenance");
  return value;
}
function features(value: unknown): CalibrationFeatures {
  const f = object(value);
  return { ruleFamily: text(f.ruleFamily), profile: text(f.profile), provenance: provenance(f.provenance), rawConfidence: probability(f.rawConfidence), detectionCertainty: f.detectionCertainty === null ? null : probability(f.detectionCertainty) };
}
function array<T>(value: unknown, parse: (value: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error("Expected calibrator array");
  return value.map((entry: unknown) => parse(entry));
}
function parseInput(value: unknown): EmpiricalCalibratorInput {
  const input = object(value);
  const samples = array(input.samples, value => { const s = object(value); return { ...features(s), id: text(s.id), caseId: text(s.caseId), repositoryId: text(s.repositoryId), observedAt: text(s.observedAt), adjudicationRef: text(s.adjudicationRef), sourceRef: text(s.sourceRef) }; });
  const manifest = validateHoldoutManifest(input.manifest);
  if (new Set(samples.map(s => s.id)).size !== samples.length) throw new Error("Duplicate calibrator sample ID");
  if (new Set(samples.map(s => s.caseId)).size !== manifest.calibration.length
    || samples.some(s => !manifest.calibration.some(c => c.caseId === s.caseId && c.repositoryId === s.repositoryId && c.observedAt === s.observedAt))) throw new Error("Training samples must cover calibration cohort exactly");
  if (new Set(samples.map(s => s.adjudicationRef)).size !== samples.length) throw new Error("Duplicate calibration adjudication evidence");
  return { candidateId: text(input.candidateId), modelVersion: text(input.modelVersion), datasetVersion: text(input.datasetVersion), manifest, binCount: natural(input.binCount, 1, 100), minimumSamples: natural(input.minimumSamples), minimumRepositories: natural(input.minimumRepositories), samples };
}
function index(score: number, bins: number): number { return Math.min(Math.floor(score * bins), bins - 1); }
function key(features: Pick<CalibrationFeatures, "ruleFamily" | "profile" | "provenance">, bin: number): string {
  return JSON.stringify([features.ruleFamily, features.profile, features.provenance, bin]);
}
function fitBins(input: EmpiricalCalibratorInput, labels: readonly ("correct" | "incorrect")[]): readonly EmpiricalCalibrationBin[] {
  const keys = [...new Set(input.samples.map(s => key(s, index(s.rawConfidence, input.binCount))))].sort();
  return keys.map(k => {
    const selected = input.samples.flatMap((s, i) => key(s, index(s.rawConfidence, input.binCount)) === k ? [{ sample: s, label: labels[i] }] : []);
    const first = selected[0].sample;
    return { ruleFamily: first.ruleFamily, profile: first.profile, provenance: first.provenance, bin: index(first.rawConfidence, input.binCount), samples: selected.length, correct: selected.filter(s => s.label === "correct").length, repositoryIds: [...new Set(selected.map(s => s.sample.repositoryId))].sort() };
  });
}
export async function fitEmpiricalCalibrator(value: unknown, verification: CalibrationLabelVerificationPort): Promise<EmpiricalCalibratorModel> {
  const input = parseInput(value);
  const exposure: CandidateTrainingExposure = { caseIds: input.manifest.calibration.map(c => c.caseId).sort(), repositoryIds: [...new Set(input.manifest.calibration.map(c => c.repositoryId))].sort(), trainedThrough: input.manifest.calibration.reduce((latest, c) => c.observedAt > latest ? c.observedAt : latest, "") };
  assertCandidateHoldoutIsolation(input.manifest, exposure);
  const labels = await Promise.all(input.samples.map(async (s): Promise<"correct" | "incorrect"> => {
    const verified = await verification.verify({ ...s });
    if ((verified.label !== "correct" && verified.label !== "incorrect") || verified.adjudicationRef !== s.adjudicationRef || verified.sourceRef !== s.sourceRef) throw new Error("Canonical reviewed labels with matching source evidence required");
    return verified.label;
  }));
  return { schemaVersion: "1", candidateId: input.candidateId, modelVersion: input.modelVersion, datasetVersion: input.datasetVersion, manifest: input.manifest, binCount: input.binCount, minimumSamples: input.minimumSamples, minimumRepositories: input.minimumRepositories, smoothing: "laplace-add-one", trainingExposure: exposure,
    trainingRefs: input.samples.map(s => ({ sampleId: s.id, caseId: s.caseId, adjudicationRef: s.adjudicationRef, sourceRef: s.sourceRef })), bins: fitBins(input, labels) };
}
function parseBin(value: unknown, count: number, repositories: readonly string[]): EmpiricalCalibrationBin {
  const b = object(value);
  const samples = natural(b.samples);
  const correct = natural(b.correct, 0, samples);
  const repositoryIds = array(b.repositoryIds, text);
  if (repositoryIds.length === 0 || repositoryIds.length > samples || new Set(repositoryIds).size !== repositoryIds.length || repositoryIds.some(r => !repositories.includes(r))) throw new Error("Invalid calibration bin repository evidence");
  return { ruleFamily: text(b.ruleFamily), profile: text(b.profile), provenance: provenance(b.provenance), bin: natural(b.bin, 0, count - 1), samples, correct, repositoryIds };
}
function parseModel(value: unknown): EmpiricalCalibratorModel {
  const m = object(value);
  if (m.schemaVersion !== "1" || m.smoothing !== "laplace-add-one") throw new Error("Invalid calibrator model version");
  const manifest = validateHoldoutManifest(m.manifest);
  const e = object(m.trainingExposure);
  const trainingExposure = { caseIds: array(e.caseIds, text), repositoryIds: array(e.repositoryIds, text), trainedThrough: text(e.trainedThrough) };
  assertCandidateHoldoutIsolation(manifest, trainingExposure);
  const latestCalibrationTime = manifest.calibration.reduce((latest, c) => c.observedAt > latest ? c.observedAt : latest, "");
  if (trainingExposure.trainedThrough !== latestCalibrationTime) throw new Error("Model training cutoff does not match calibration exposure");
  if (JSON.stringify([...trainingExposure.caseIds].sort()) !== JSON.stringify(manifest.calibration.map(c => c.caseId).sort())
    || JSON.stringify([...trainingExposure.repositoryIds].sort()) !== JSON.stringify([...new Set(manifest.calibration.map(c => c.repositoryId))].sort())) throw new Error("Model exposure must match calibration cohort");
  const trainingRefs = array(m.trainingRefs, value => { const r = object(value); return { sampleId: text(r.sampleId), caseId: text(r.caseId), adjudicationRef: text(r.adjudicationRef), sourceRef: text(r.sourceRef) }; });
  const binCount = natural(m.binCount, 1, 100);
  const bins = array(m.bins, value => parseBin(value, binCount, trainingExposure.repositoryIds));
  if (new Set(trainingRefs.map(r => r.sampleId)).size !== trainingRefs.length || new Set(trainingRefs.map(r => r.adjudicationRef)).size !== trainingRefs.length
    || trainingRefs.some(r => !trainingExposure.caseIds.includes(r.caseId)) || new Set(trainingRefs.map(r => r.caseId)).size !== trainingExposure.caseIds.length
    || bins.reduce((sum, b) => sum + b.samples, 0) !== trainingRefs.length || new Set(bins.map(b => key(b, b.bin))).size !== bins.length) throw new Error("Inconsistent calibrator model training evidence");
  return { schemaVersion: "1", smoothing: "laplace-add-one", candidateId: text(m.candidateId), modelVersion: text(m.modelVersion), datasetVersion: text(m.datasetVersion), manifest, binCount, minimumSamples: natural(m.minimumSamples), minimumRepositories: natural(m.minimumRepositories), trainingExposure, trainingRefs, bins };
}
/** Sparse groups abstain; probabilities are advisory metadata and cannot change domain confidence or mandatory policy. */
export function predictEmpiricalProbability(modelValue: unknown, featureValue: unknown): EmpiricalPrediction {
  const model = parseModel(modelValue);
  const f = features(featureValue);
  const bin = model.bins.find(b => key(b, b.bin) === key(f, index(f.rawConfidence, model.binCount)));
  const sufficient = bin !== undefined && bin.samples >= model.minimumSamples && bin.repositoryIds.length >= model.minimumRepositories;
  return { ...f, modelVersion: model.modelVersion, probability: sufficient ? (bin.correct + 1) / (bin.samples + 2) : null, basis: sufficient ? "empirical-bin-laplace" : "insufficient-evidence", samples: bin?.samples ?? 0, repositories: bin?.repositoryIds.length ?? 0, correct: bin?.correct ?? 0 };
}
