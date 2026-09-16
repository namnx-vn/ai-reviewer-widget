export interface CalibrationSample {
  id: string;
  repositoryId: string;
  ruleFamily: string;
  profile: string;
  rawConfidence: number | null;
  detectionCertainty: number | null;
  calibratedProbability: number | null;
  label: "correct" | "incorrect" | "pending" | "excluded";
}
export interface CalibrationInput {
  modelVersion: string;
  datasetVersion: string;
  binCount: number;
  samples: readonly CalibrationSample[];
}
export interface ReliabilityBucket {
  lower: number;
  upper: number;
  samples: number;
  meanProbability: number | null;
  empiricalAccuracy: number | null;
}
export interface CalibrationMetrics {
  evaluatedSamples: number;
  repositories: number;
  pendingSamples: number;
  excludedSamples: number;
  missingProbabilities: number;
  rawConfidenceSamples: number;
  detectionCertaintySamples: number;
  brierScore: number | null;
  ece: number | null;
  buckets: readonly ReliabilityBucket[];
}
export interface CalibrationGroup { key: string; metrics: CalibrationMetrics }
export interface CalibrationReport {
  schemaVersion: "1";
  modelVersion: string;
  datasetVersion: string;
  binCount: number;
  sampleManifest: string;
  summary: CalibrationMetrics;
  groups: { ruleFamily: readonly CalibrationGroup[]; profile: readonly CalibrationGroup[] };
}
export interface CalibrationGatePolicy {
  policyVersion: string;
  minimumSamples: number;
  minimumRepositories: number;
  maximumBrierScore: number;
  maximumEce: number;
  maximumBrierRegression: number;
  maximumEceRegression: number;
  protectedGroups: readonly { dimension: "ruleFamily" | "profile"; key: string }[];
}
export interface CalibrationDriftResult {
  schemaVersion: "1";
  policyVersion: string;
  currentModelVersion: string;
  baselineModelVersion: string;
  datasetVersion: string;
  status: "pass" | "fail" | "insufficient-evidence";
  comparisons: readonly {
    scope: string;
    status: "pass" | "fail" | "insufficient-evidence";
    brierDelta: number | null;
    eceDelta: number | null;
    reasons: readonly string[];
  }[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected calibration object");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) throw new Error("Expected calibration identifier");
  return value;
}
function probability(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid calibration probability");
  return value;
}
function natural(value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("Invalid calibration sample count");
  return value;
}
function parseSample(value: unknown): CalibrationSample {
  const s = object(value);
  if (s.label !== "correct" && s.label !== "incorrect" && s.label !== "pending" && s.label !== "excluded") throw new Error("Invalid calibration label");
  return { id: text(s.id), repositoryId: text(s.repositoryId), ruleFamily: text(s.ruleFamily), profile: text(s.profile), rawConfidence: probability(s.rawConfidence), detectionCertainty: probability(s.detectionCertainty), calibratedProbability: probability(s.calibratedProbability), label: s.label };
}
function parseInput(value: unknown): CalibrationInput {
  const input = object(value);
  if (!Array.isArray(input.samples)) throw new Error("Expected calibration samples");
  const samples = input.samples.map((s: unknown) => parseSample(s));
  if (new Set(samples.map(s => s.id)).size !== samples.length) throw new Error("Duplicate calibration sample ID");
  return { modelVersion: text(input.modelVersion), datasetVersion: text(input.datasetVersion), binCount: natural(input.binCount, 1, 100), samples };
}
/** Domain confidence stays unchanged; only separately supplied calibrated probabilities enter Brier/ECE. */
function metrics(samples: readonly CalibrationSample[], bins: number): CalibrationMetrics {
  const labeled = samples.filter(s => s.label === "correct" || s.label === "incorrect");
  const evaluated = labeled.filter((s): s is CalibrationSample & { calibratedProbability: number } => s.calibratedProbability !== null);
  const buckets = Array.from({ length: bins }, (_, i): ReliabilityBucket => {
    const group = evaluated.filter(s => Math.min(Math.floor(s.calibratedProbability * bins), bins - 1) === i);
    return { lower: i / bins, upper: (i + 1) / bins, samples: group.length,
      meanProbability: group.length === 0 ? null : group.reduce((sum, s) => sum + s.calibratedProbability, 0) / group.length,
      empiricalAccuracy: group.length === 0 ? null : group.filter(s => s.label === "correct").length / group.length };
  });
  const n = evaluated.length;
  return {
    evaluatedSamples: n, repositories: new Set(evaluated.map(s => s.repositoryId)).size,
    pendingSamples: samples.filter(s => s.label === "pending").length, excludedSamples: samples.filter(s => s.label === "excluded").length,
    missingProbabilities: labeled.length - n, rawConfidenceSamples: samples.filter(s => s.rawConfidence !== null).length,
    detectionCertaintySamples: samples.filter(s => s.detectionCertainty !== null).length,
    brierScore: n === 0 ? null : evaluated.reduce((sum, s) => sum + (s.calibratedProbability - (s.label === "correct" ? 1 : 0)) ** 2, 0) / n,
    ece: n === 0 ? null : buckets.reduce((sum, b) => sum + (b.meanProbability === null || b.empiricalAccuracy === null ? 0 : b.samples / n * Math.abs(b.meanProbability - b.empiricalAccuracy)), 0), buckets,
  };
}
function groups(input: CalibrationInput, dimension: "ruleFamily" | "profile"): readonly CalibrationGroup[] {
  return [...new Set(input.samples.map(s => s[dimension]))].sort().map(key => ({ key, metrics: metrics(input.samples.filter(s => s[dimension] === key), input.binCount) }));
}
export function buildCalibrationReport(value: unknown): CalibrationReport {
  const input = parseInput(value);
  return { schemaVersion: "1", modelVersion: input.modelVersion, datasetVersion: input.datasetVersion, binCount: input.binCount,
    sampleManifest: JSON.stringify([...input.samples].sort((a, b) => a.id.localeCompare(b.id)).map(s => [s.id, s.repositoryId, s.ruleFamily, s.profile, s.label])),
    summary: metrics(input.samples, input.binCount), groups: { ruleFamily: groups(input, "ruleFamily"), profile: groups(input, "profile") } };
}
function parsePolicy(value: unknown): CalibrationGatePolicy {
  const p = object(value);
  if (!Array.isArray(p.protectedGroups)) throw new Error("Expected protected calibration groups");
  const protectedGroups = p.protectedGroups.map((value: unknown): CalibrationGatePolicy["protectedGroups"][number] => {
    const group = object(value);
    if (group.dimension !== "ruleFamily" && group.dimension !== "profile") throw new Error("Invalid protected calibration dimension");
    return { dimension: group.dimension, key: text(group.key) };
  });
  const rate = (value: unknown): number => { const result = probability(value); if (result === null) throw new Error("Calibration policy rate required"); return result; };
  return { policyVersion: text(p.policyVersion), minimumSamples: natural(p.minimumSamples), minimumRepositories: natural(p.minimumRepositories), maximumBrierScore: rate(p.maximumBrierScore), maximumEce: rate(p.maximumEce), maximumBrierRegression: rate(p.maximumBrierRegression), maximumEceRegression: rate(p.maximumEceRegression), protectedGroups };
}
function compare(scope: string, current: CalibrationMetrics | undefined, baseline: CalibrationMetrics | undefined, policy: CalibrationGatePolicy): CalibrationDriftResult["comparisons"][number] {
  const insufficient = !current || !baseline || [current, baseline].some(m => m.evaluatedSamples < policy.minimumSamples || m.repositories < policy.minimumRepositories || m.pendingSamples > 0 || m.excludedSamples > 0 || m.missingProbabilities > 0 || m.brierScore === null || m.ece === null);
  if (insufficient || !current || !baseline || current.brierScore === null || baseline.brierScore === null || current.ece === null || baseline.ece === null) return { scope, status: "insufficient-evidence", brierDelta: null, eceDelta: null, reasons: ["Missing, pending, excluded or insufficient calibration evidence"] };
  const brierDelta = current.brierScore - baseline.brierScore;
  const eceDelta = current.ece - baseline.ece;
  const reasons = [
    ...(current.brierScore > policy.maximumBrierScore ? ["Brier score exceeds ceiling"] : []),
    ...(current.ece > policy.maximumEce ? ["Calibration error exceeds ceiling"] : []),
    ...(brierDelta > policy.maximumBrierRegression ? ["Brier score regressed"] : []),
    ...(eceDelta > policy.maximumEceRegression ? ["Calibration error regressed"] : []),
  ];
  return { scope, status: reasons.length === 0 ? "pass" : "fail", brierDelta, eceDelta, reasons };
}
/** Comparisons are descriptive, never a rule/policy mutation or an independence claim for correlated findings. */
export function compareCalibrationReports(currentValue: unknown, baselineValue: unknown, policyValue: unknown): CalibrationDriftResult {
  const current = parseReport(currentValue);
  const baseline = parseReport(baselineValue);
  const policy = parsePolicy(policyValue);
  const compatible = current.schemaVersion === baseline.schemaVersion && current.datasetVersion === baseline.datasetVersion && current.binCount === baseline.binCount && current.sampleManifest === baseline.sampleManifest;
  const comparisons: CalibrationDriftResult["comparisons"] = compatible ? [
    compare("overall", current.summary, baseline.summary, policy),
    ...policy.protectedGroups.map(group => compare(`${group.dimension}:${group.key}`, current.groups[group.dimension].find(g => g.key === group.key)?.metrics, baseline.groups[group.dimension].find(g => g.key === group.key)?.metrics, policy)),
  ] : [{ scope: "overall", status: "insufficient-evidence", brierDelta: null, eceDelta: null, reasons: ["Dataset, sample manifest, schema or reliability bucket versions differ"] }];
  return { schemaVersion: "1", policyVersion: policy.policyVersion, currentModelVersion: current.modelVersion, baselineModelVersion: baseline.modelVersion, datasetVersion: current.datasetVersion,
    status: comparisons.some(c => c.status === "insufficient-evidence") ? "insufficient-evidence" : comparisons.some(c => c.status === "fail") ? "fail" : "pass", comparisons };
}

function parseMetrics(value: unknown, bins: number): CalibrationMetrics {
  const m = object(value);
  if (!Array.isArray(m.buckets) || m.buckets.length !== bins) throw new Error("Invalid reliability buckets");
  const buckets = m.buckets.map((value: unknown, i): ReliabilityBucket => {
    const b = object(value);
    if (b.lower !== i / bins || b.upper !== (i + 1) / bins) throw new Error("Inconsistent reliability bucket bounds");
    const samples = natural(b.samples, 0);
    const meanProbability = probability(b.meanProbability);
    const empiricalAccuracy = probability(b.empiricalAccuracy);
    if ((samples === 0) !== (meanProbability === null) || (samples === 0) !== (empiricalAccuracy === null)) throw new Error("Inconsistent reliability bucket denominator");
    if (meanProbability !== null && (meanProbability < i / bins || meanProbability > (i + 1) / bins)) throw new Error("Bucket mean outside reliability bounds");
    return { lower: i / bins, upper: (i + 1) / bins, samples, meanProbability, empiricalAccuracy };
  });
  const evaluatedSamples = natural(m.evaluatedSamples, 0);
  const repositories = natural(m.repositories, 0);
  const brierScore = probability(m.brierScore);
  const ece = probability(m.ece);
  if (repositories > evaluatedSamples || buckets.reduce((sum, b) => sum + b.samples, 0) !== evaluatedSamples
    || (evaluatedSamples === 0) !== (brierScore === null) || (evaluatedSamples === 0) !== (ece === null)) throw new Error("Inconsistent calibration denominator");
  if (evaluatedSamples > 0 && ece !== null && brierScore !== null) {
    const computedEce = buckets.reduce((sum, b) => sum + (b.meanProbability === null || b.empiricalAccuracy === null ? 0 : b.samples / evaluatedSamples * Math.abs(b.meanProbability - b.empiricalAccuracy)), 0);
    const minimumBrier = buckets.reduce((sum, b) => sum + (b.meanProbability === null || b.empiricalAccuracy === null ? 0 : b.samples / evaluatedSamples * (b.meanProbability - b.empiricalAccuracy) ** 2), 0);
    if (Math.abs(ece - computedEce) > 1e-12 || brierScore + 1e-12 < minimumBrier) throw new Error("Calibration scores contradict reliability buckets");
  }
  return { evaluatedSamples, repositories, brierScore, ece, buckets,
    pendingSamples: natural(m.pendingSamples, 0), excludedSamples: natural(m.excludedSamples, 0), missingProbabilities: natural(m.missingProbabilities, 0),
    rawConfidenceSamples: natural(m.rawConfidenceSamples, 0), detectionCertaintySamples: natural(m.detectionCertaintySamples, 0) };
}
function parseGroups(value: unknown, bins: number): readonly CalibrationGroup[] {
  if (!Array.isArray(value)) throw new Error("Expected calibration group report");
  const groups = value.map((value: unknown) => { const g = object(value); return { key: text(g.key), metrics: parseMetrics(g.metrics, bins) }; });
  if (new Set(groups.map(g => g.key)).size !== groups.length) throw new Error("Duplicate calibration group report");
  return groups;
}
function parseReport(value: unknown): CalibrationReport {
  const report = object(value);
  if (report.schemaVersion !== "1") throw new Error("Invalid calibration report schema");
  const bins = natural(report.binCount, 1, 100);
  const groups = object(report.groups);
  return { schemaVersion: "1", modelVersion: text(report.modelVersion), datasetVersion: text(report.datasetVersion), binCount: bins,
    sampleManifest: text(report.sampleManifest), summary: parseMetrics(report.summary, bins),
    groups: { ruleFamily: parseGroups(groups.ruleFamily, bins), profile: parseGroups(groups.profile, bins) } };
}
