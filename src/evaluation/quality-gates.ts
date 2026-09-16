import { assertCandidateHoldoutIsolation, validateHoldoutManifest } from "./holdout";
import type { CandidateTrainingExposure, HoldoutManifest } from "./holdout";

export interface QualityCaseCounts {
  truePositives: number;
  falsePositives: number;
  blockingTruePositives: number;
  blockingFalsePositives: number;
  positiveExpected: number;
  positiveDetected: number;
  protectedPositiveExpected: number;
  protectedPositiveDetected: number;
  criticalPositiveExpected: number;
  criticalPositiveDetected: number;
  criticalFalsePositives: number;
  negativeControls: number;
  negativeControlFalsePositives: number;
  unadjudicated: number;
}

export interface PairedQualityCase {
  caseId: string;
  repositoryId: string;
  observedAt: string;
  fidelity: "verified-source" | "synthetic" | "invalid-fixture";
  adjudicationRef: string;
  snapshotRef: string;
  ruleFamily: string;
  executionSucceeded: boolean;
  contextComplete: boolean;
  candidate: QualityCaseCounts;
  production: QualityCaseCounts;
}

export interface PromotionQualityPolicy {
  policyVersion: string;
  minimumCases: number;
  minimumRepositories: number;
  minimumPrecisionRepositories: number;
  minimumBlockingPrecisionRepositories: number;
  minimumPositiveExpectations: number;
  minimumProtectedPositiveExpectations: number;
  minimumCriticalPositiveExpectations: number;
  minimumNegativeControls: number;
  minimumPrecision: number;
  minimumBlockingPrecision: number;
  minimumRecall: number;
  maximumRecallRegression: number;
  maximumNegativeControlFalsePositives: number;
}

export interface PromotionQualityInput {
  candidateId: string;
  artifactDigest: string;
  baselineVersion: string;
  datasetVersion: string;
  candidateExposure: CandidateTrainingExposure;
  ruleFamily: string;
  manifest: HoldoutManifest;
  policy: PromotionQualityPolicy;
  cases: readonly PairedQualityCase[];
}

export interface PromotionQualityResult {
  schemaVersion: "1";
  candidateId: string;
  artifactDigest: string;
  baselineVersion: string;
  datasetVersion: string;
  manifestId: string;
  ruleFamily: string;
  policyVersion: string;
  qualityStatus: "pass" | "fail" | "insufficient-evidence";
  operationalStatus: "pass" | "fail";
  reasons: readonly string[];
  metrics: {
    precision: number | null;
    blockingPrecision: number | null;
    productionPrecision: number | null;
    productionBlockingPrecision: number | null;
    recall: number | null;
    productionRecall: number | null;
    precisionRepositoryLowerBound: number | null;
    blockingPrecisionRepositoryLowerBound: number | null;
    repositories: number;
    precisionRepositories: number;
    blockingPrecisionRepositories: number;
    positiveExpectations: number;
    protectedPositiveExpectations: number;
    criticalPositiveExpectations: number;
    negativeControls: number;
    pendingLabels: number;
  };
}

function natural(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid nonnegative count: ${label}`);
}

/** Two-sided 95% Wilson lower bound, fixed z=1.959963984540054. */
export function wilsonLowerBound(successes: number, total: number): number | null {
  natural(successes, "successes");
  natural(total, "total");
  if (successes > total) throw new Error("Success count exceeds denominator");
  if (total === 0) return null;
  if (successes === 0) return 0;
  const z = 1.959963984540054;
  const p = successes / total;
  return Math.max(0, (p + z * z / (2 * total) - z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / (1 + z * z / total));
}

function validatePolicy(policy: PromotionQualityPolicy): void {
  if (typeof policy.policyVersion !== "string" || !policy.policyVersion.trim()) throw new Error("Policy version required");
  const minima = [policy.minimumCases, policy.minimumRepositories, policy.minimumPrecisionRepositories,
    policy.minimumBlockingPrecisionRepositories, policy.minimumPositiveExpectations, policy.minimumProtectedPositiveExpectations,
    policy.minimumCriticalPositiveExpectations, policy.minimumNegativeControls];
  minima.forEach(value => { natural(value, "policy minimum"); if (value === 0) throw new Error("Sample minima must be positive"); });
  for (const value of [policy.minimumPrecision, policy.minimumBlockingPrecision, policy.minimumRecall, policy.maximumRecallRegression]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Policy rates must be finite between zero and one");
  }
  natural(policy.maximumNegativeControlFalsePositives, "negative control budget");
}

function validateCounts(counts: QualityCaseCounts): void {
  const keys: readonly (keyof QualityCaseCounts)[] = [
    "truePositives", "falsePositives", "blockingTruePositives", "blockingFalsePositives",
    "positiveExpected", "positiveDetected", "protectedPositiveExpected", "protectedPositiveDetected",
    "criticalPositiveExpected", "criticalPositiveDetected", "criticalFalsePositives",
    "negativeControls", "negativeControlFalsePositives", "unadjudicated",
  ];
  keys.forEach(key => natural(counts[key], key));
  if (counts.blockingTruePositives > counts.truePositives || counts.blockingFalsePositives > counts.falsePositives
    || counts.criticalFalsePositives > counts.falsePositives
    || counts.negativeControlFalsePositives > counts.falsePositives
    || counts.positiveDetected > counts.positiveExpected
    || counts.protectedPositiveDetected > counts.protectedPositiveExpected
    || counts.criticalPositiveDetected > counts.criticalPositiveExpected
    || counts.protectedPositiveExpected > counts.positiveExpected
    || counts.criticalPositiveExpected > counts.positiveExpected
    || counts.protectedPositiveDetected > counts.positiveDetected
    || counts.criticalPositiveDetected > counts.positiveDetected) throw new Error("Inconsistent quality counts");
}

function validatePairs(manifest: HoldoutManifest, cases: readonly PairedQualityCase[], ruleFamily: string): void {
  if (typeof ruleFamily !== "string" || !ruleFamily.trim()) throw new Error("Rule family scope required");
  if (cases.length !== manifest.protectedHoldout.length || new Set(cases.map(c => c.caseId)).size !== cases.length) {
    throw new Error("Paired evaluation must cover protected holdout exactly once");
  }
  for (const entry of cases) {
    if (!manifest.protectedHoldout.some(c => c.caseId === entry.caseId && c.repositoryId === entry.repositoryId && c.observedAt === entry.observedAt && entry.ruleFamily === ruleFamily)) {
      throw new Error("Paired evaluation does not match protected holdout");
    }
    if (!entry.adjudicationRef?.trim() || !entry.snapshotRef?.trim()) throw new Error("Source and adjudication references required");
    if (!["verified-source", "synthetic", "invalid-fixture"].includes(entry.fidelity)) throw new Error("Invalid evidence fidelity");
    if (typeof entry.executionSucceeded !== "boolean" || typeof entry.contextComplete !== "boolean") throw new Error("Invalid operational state");
    validateCounts(entry.candidate);
    validateCounts(entry.production);
    for (const key of ["positiveExpected", "protectedPositiveExpected", "criticalPositiveExpected", "negativeControls"] as const) {
      if (entry.candidate[key] !== entry.production[key]) throw new Error("Candidate and production must share ground-truth denominators");
    }
  }
}

function sum(cases: readonly PairedQualityCase[], key: keyof QualityCaseCounts, side: "candidate" | "production" = "candidate"): number {
  const total = cases.reduce((value, entry) => value + entry[side][key], 0);
  natural(total, `aggregate ${key}`);
  return total;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Correlated findings never count as independent statistical trials. Each repository
 * is one binary unit: success means every adjudicated emitted finding is correct.
 * The Wilson interval describes repository cleanliness, not finding-level precision.
 * Both observed finding precision and this deliberately strict reliability gate apply.
 */
function repositoryPrecision(cases: readonly PairedQualityCase[], blocking: boolean): { total: number; lower: number | null } {
  const groups = new Map<string, { tp: number; fp: number }>();
  for (const entry of cases) {
    const old = groups.get(entry.repositoryId) ?? { tp: 0, fp: 0 };
    groups.set(entry.repositoryId, {
      tp: old.tp + (blocking ? entry.candidate.blockingTruePositives : entry.candidate.truePositives),
      fp: old.fp + (blocking ? entry.candidate.blockingFalsePositives : entry.candidate.falsePositives),
    });
  }
  const emitting = [...groups.values()].filter(g => g.tp + g.fp > 0);
  return { total: emitting.length, lower: wilsonLowerBound(emitting.filter(g => g.fp === 0).length, emitting.length) };
}

export function evaluatePromotionQuality(input: PromotionQualityInput): PromotionQualityResult {
  const manifest = validateHoldoutManifest(input.manifest);
  for (const identifier of [input.candidateId, input.baselineVersion, input.datasetVersion]) {
    if (typeof identifier !== "string" || !identifier.trim()) throw new Error("Bound candidate, baseline and dataset versions required");
  }
  if (!/^[a-f0-9]{64}$/.test(input.artifactDigest)) throw new Error("Candidate artifact SHA-256 required");
  assertCandidateHoldoutIsolation(manifest, input.candidateExposure);
  validatePolicy(input.policy);
  validatePairs(manifest, input.cases, input.ruleFamily);
  const { cases, policy } = input;
  const precisionUnits = repositoryPrecision(cases, false);
  const blockingUnits = repositoryPrecision(cases, true);
  const expected = sum(cases, "positiveExpected");
  const tp = sum(cases, "truePositives");
  const blockingTp = sum(cases, "blockingTruePositives");
  const metrics: PromotionQualityResult["metrics"] = {
    precision: rate(tp, tp + sum(cases, "falsePositives")),
    blockingPrecision: rate(blockingTp, blockingTp + sum(cases, "blockingFalsePositives")),
    productionPrecision: rate(sum(cases, "truePositives", "production"), sum(cases, "truePositives", "production") + sum(cases, "falsePositives", "production")),
    productionBlockingPrecision: rate(sum(cases, "blockingTruePositives", "production"), sum(cases, "blockingTruePositives", "production") + sum(cases, "blockingFalsePositives", "production")),
    recall: rate(sum(cases, "positiveDetected"), expected),
    productionRecall: rate(sum(cases, "positiveDetected", "production"), expected),
    precisionRepositoryLowerBound: precisionUnits.lower,
    blockingPrecisionRepositoryLowerBound: blockingUnits.lower,
    repositories: new Set(cases.map(c => c.repositoryId)).size,
    precisionRepositories: precisionUnits.total, blockingPrecisionRepositories: blockingUnits.total,
    positiveExpectations: expected, protectedPositiveExpectations: sum(cases, "protectedPositiveExpected"),
    criticalPositiveExpectations: sum(cases, "criticalPositiveExpected"), negativeControls: sum(cases, "negativeControls"),
    pendingLabels: sum(cases, "unadjudicated") + sum(cases, "unadjudicated", "production"),
  };
  const operationalStatus = cases.every(c => c.executionSucceeded && c.contextComplete) ? "pass" : "fail";
  const insufficient = [
    ...insufficientReasons(cases.length, metrics, policy, operationalStatus),
    ...(cases.some(c => c.fidelity !== "verified-source") ? ["Protected evidence is not verified repository source"] : []),
  ];
  const failures = failureReasons(cases, metrics, policy);
  return {
    schemaVersion: "1", candidateId: input.candidateId, artifactDigest: input.artifactDigest,
    baselineVersion: input.baselineVersion, datasetVersion: input.datasetVersion, manifestId: manifest.manifestId, ruleFamily: input.ruleFamily, policyVersion: policy.policyVersion,
    operationalStatus, qualityStatus: insufficient.length > 0 ? "insufficient-evidence" : failures.length > 0 ? "fail" : "pass",
    metrics, reasons: [...insufficient, ...failures],
  };
}

function insufficientReasons(
  caseCount: number, metrics: PromotionQualityResult["metrics"], policy: PromotionQualityPolicy, operational: "pass" | "fail",
): string[] {
  return [
    ...(operational === "fail" ? ["Execution or source context incomplete"] : []),
    ...(metrics.pendingLabels > 0 ? ["Pending adjudication labels"] : []),
    ...(caseCount < policy.minimumCases ? ["Insufficient paired cases"] : []),
    ...(metrics.repositories < policy.minimumRepositories ? ["Insufficient independent repositories"] : []),
    ...(metrics.precisionRepositories < policy.minimumPrecisionRepositories ? ["Insufficient emitting precision repositories"] : []),
    ...(metrics.blockingPrecisionRepositories < policy.minimumBlockingPrecisionRepositories ? ["Insufficient emitting blocking repositories"] : []),
    ...(metrics.positiveExpectations < policy.minimumPositiveExpectations ? ["Insufficient positive expectations"] : []),
    ...(metrics.protectedPositiveExpectations < policy.minimumProtectedPositiveExpectations ? ["Insufficient protected positive expectations"] : []),
    ...(metrics.criticalPositiveExpectations < policy.minimumCriticalPositiveExpectations ? ["Insufficient critical positive expectations"] : []),
    ...(metrics.negativeControls < policy.minimumNegativeControls ? ["Insufficient negative controls"] : []),
  ];
}

function failureReasons(cases: readonly PairedQualityCase[], metrics: PromotionQualityResult["metrics"], policy: PromotionQualityPolicy): string[] {
  return [
    ...(metrics.precision !== null && metrics.productionPrecision !== null && metrics.precision < metrics.productionPrecision ? ["Precision regressed against paired production"] : []),
    ...(metrics.blockingPrecision !== null && metrics.productionBlockingPrecision !== null && metrics.blockingPrecision < metrics.productionBlockingPrecision ? ["Blocking precision regressed against paired production"] : []),
    ...((metrics.precision !== null && metrics.precision < policy.minimumPrecision)
      || (metrics.precisionRepositoryLowerBound !== null && metrics.precisionRepositoryLowerBound < policy.minimumPrecision) ? ["Precision or independent repository reliability below floor"] : []),
    ...((metrics.blockingPrecision !== null && metrics.blockingPrecision < policy.minimumBlockingPrecision)
      || (metrics.blockingPrecisionRepositoryLowerBound !== null && metrics.blockingPrecisionRepositoryLowerBound < policy.minimumBlockingPrecision) ? ["Blocking precision or repository reliability below floor"] : []),
    ...(metrics.recall !== null && metrics.recall < policy.minimumRecall ? ["Recall below floor"] : []),
    ...(metrics.recall !== null && metrics.productionRecall !== null
      && metrics.productionRecall - metrics.recall > policy.maximumRecallRegression ? ["Recall regressed against paired production"] : []),
    ...(cases.some(c => c.candidate.protectedPositiveDetected < c.candidate.protectedPositiveExpected
      || c.candidate.criticalPositiveDetected < c.candidate.criticalPositiveExpected) ? ["Protected or critical must-find expectation missed"] : []),
    ...(cases.some(c => c.candidate.blockingTruePositives < c.production.blockingTruePositives) ? ["Blocking true-positive detection or severity regression"] : []),
    ...(cases.some(c => c.candidate.protectedPositiveDetected < c.production.protectedPositiveDetected
      || c.candidate.criticalPositiveDetected < c.production.criticalPositiveDetected) ? ["Protected or critical positive regression"] : []),
    ...(sum(cases, "criticalFalsePositives") > 0 ? ["Critical false positive"] : []),
    ...(sum(cases, "negativeControlFalsePositives") > policy.maximumNegativeControlFalsePositives
      || cases.some(c => c.candidate.negativeControlFalsePositives > c.production.negativeControlFalsePositives) ? ["Protected negative control regression"] : []),
    ...(cases.some(c => c.candidate.blockingFalsePositives > c.production.blockingFalsePositives) ? ["Blocking false-positive regression"] : []),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected quality input object");
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Expected nonempty quality input string");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number") throw new Error("Expected quality input number");
  return value;
}

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("Expected training exposure identifiers");
  return value.map((entry: unknown) => string(entry));
}

function parseCounts(value: unknown): QualityCaseCounts {
  const c = object(value);
  return {
    truePositives: number(c.truePositives), falsePositives: number(c.falsePositives),
    blockingTruePositives: number(c.blockingTruePositives), blockingFalsePositives: number(c.blockingFalsePositives),
    positiveExpected: number(c.positiveExpected), positiveDetected: number(c.positiveDetected),
    protectedPositiveExpected: number(c.protectedPositiveExpected), protectedPositiveDetected: number(c.protectedPositiveDetected),
    criticalPositiveExpected: number(c.criticalPositiveExpected), criticalPositiveDetected: number(c.criticalPositiveDetected),
    criticalFalsePositives: number(c.criticalFalsePositives), negativeControls: number(c.negativeControls),
    negativeControlFalsePositives: number(c.negativeControlFalsePositives), unadjudicated: number(c.unadjudicated),
  };
}

function parsePolicy(value: unknown): PromotionQualityPolicy {
  const p = object(value);
  return {
    policyVersion: string(p.policyVersion), minimumCases: number(p.minimumCases), minimumRepositories: number(p.minimumRepositories),
    minimumPrecisionRepositories: number(p.minimumPrecisionRepositories), minimumBlockingPrecisionRepositories: number(p.minimumBlockingPrecisionRepositories),
    minimumPositiveExpectations: number(p.minimumPositiveExpectations), minimumProtectedPositiveExpectations: number(p.minimumProtectedPositiveExpectations),
    minimumCriticalPositiveExpectations: number(p.minimumCriticalPositiveExpectations), minimumNegativeControls: number(p.minimumNegativeControls),
    minimumPrecision: number(p.minimumPrecision), minimumBlockingPrecision: number(p.minimumBlockingPrecision), minimumRecall: number(p.minimumRecall),
    maximumRecallRegression: number(p.maximumRecallRegression), maximumNegativeControlFalsePositives: number(p.maximumNegativeControlFalsePositives),
  };
}

function parsePair(value: unknown): PairedQualityCase {
  const c = object(value);
  if (typeof c.executionSucceeded !== "boolean" || typeof c.contextComplete !== "boolean") throw new Error("Expected execution/context booleans");
  if (c.fidelity !== "verified-source" && c.fidelity !== "synthetic" && c.fidelity !== "invalid-fixture") throw new Error("Expected evidence fidelity");
  return {
    caseId: string(c.caseId), repositoryId: string(c.repositoryId), observedAt: string(c.observedAt), ruleFamily: string(c.ruleFamily),
    fidelity: c.fidelity, snapshotRef: string(c.snapshotRef), adjudicationRef: string(c.adjudicationRef),
    executionSucceeded: c.executionSucceeded, contextComplete: c.contextComplete,
    candidate: parseCounts(c.candidate), production: parseCounts(c.production),
  };
}

/** Validate external JSON without trusting casts; source refs must also be resolved by the trusted evaluator adapter. */
export function parsePromotionQualityInput(value: unknown): PromotionQualityInput {
  const input = object(value);
  const exposure = object(input.candidateExposure);
  if (!Array.isArray(input.cases)) throw new Error("Expected paired evaluation cases");
  const parsed: PromotionQualityInput = {
    candidateId: string(input.candidateId), artifactDigest: string(input.artifactDigest),
    baselineVersion: string(input.baselineVersion), datasetVersion: string(input.datasetVersion),
    candidateExposure: { caseIds: strings(exposure.caseIds), repositoryIds: strings(exposure.repositoryIds), trainedThrough: string(exposure.trainedThrough) },
    ruleFamily: string(input.ruleFamily), manifest: validateHoldoutManifest(input.manifest),
    policy: parsePolicy(input.policy), cases: input.cases.map((entry: unknown) => parsePair(entry)),
  };
  evaluatePromotionQuality(parsed);
  return parsed;
}
