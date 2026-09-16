import type { Severity } from "./contracts";

export interface ReviewerTrustPolicy {
  readonly version: string;
  readonly minimumRepositories: number;
  readonly minimumFindings: number;
  readonly minimumBlockingPrecision: number;
  readonly minimumCommentPrecision: number;
  readonly maximumCalibrationError: number;
  readonly minimumCalibrationSamples: number;
}

/** Trusted evaluator attestations; sourceVerified must never come directly from AI or repository text. */
export interface VerifiedFamilyQuality {
  readonly version: string;
  readonly datasetVersion: string;
  readonly ruleFamily: string;
  readonly sourceVerified: boolean;
  readonly pendingLabels: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly emittingRepositories: number;
  readonly cleanRepositories: number;
  readonly blockingTruePositives: number;
  readonly blockingFalsePositives: number;
  readonly blockingEmittingRepositories: number;
  readonly blockingCleanRepositories: number;
}

export interface VerifiedFamilyCalibration {
  readonly version: string;
  readonly datasetVersion: string;
  readonly ruleFamily: string;
  readonly scope: "blocking" | "comment";
  readonly sourceVerified: boolean;
  readonly samples: number;
  readonly independentRepositories: number;
  readonly expectedCalibrationError: number;
}

export interface MandatoryTrustException {
  readonly policyVersion: string;
  readonly auditRef: string;
  readonly reason: string;
  readonly ruleIds: readonly string[];
}

export interface ReviewerTrustInput {
  readonly ruleId: string;
  readonly ruleFamily: string;
  readonly severity: Severity;
  readonly policy: ReviewerTrustPolicy;
  readonly quality?: VerifiedFamilyQuality;
  readonly calibration?: VerifiedFamilyCalibration;
  readonly evidence: { readonly contractVersion: string; readonly verified: boolean; readonly contradictory: boolean };
  /** Authorized governance adapter supplies this; ordinary developer feedback cannot create it. */
  readonly mandatoryException?: MandatoryTrustException;
}

export interface ReviewerTrustResult {
  readonly schemaVersion: "1";
  readonly policyVersion: string;
  readonly ruleId: string;
  readonly ruleFamily: string;
  readonly qualityVersion: string | null;
  readonly datasetVersion: string | null;
  readonly calibrationVersion: string | null;
  readonly evidenceContractVersion: string;
  readonly status: "eligible" | "ineligible" | "insufficient-evidence" | "mandatory-policy-exception";
  readonly basis: "measured-quality" | "mandatory-policy";
  readonly canBlock: boolean;
  readonly canComment: boolean;
  readonly precision: number | null;
  readonly blockingPrecision: number | null;
  /** 95% Wilson bound on independent repository cleanliness, not finding-level precision. */
  readonly repositoryReliabilityLowerBound: number | null;
  readonly reasons: readonly string[];
  readonly exceptionAuditRef: string | null;
}

function nonempty(value: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error("Trust policy versions and scope must be nonempty");
}

function natural(value: number, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error("Invalid trust sample count");
}

function rate(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid trust rate");
}

function validate(input: ReviewerTrustInput): void {
  const { policy, quality, calibration, mandatoryException, evidence } = input;
  [input.ruleId, input.ruleFamily, policy.version, evidence.contractVersion].forEach(nonempty);
  if (!["critical", "high", "medium", "low", "info"].includes(input.severity)) throw new Error("Invalid trust severity");
  [policy.minimumRepositories, policy.minimumFindings, policy.minimumCalibrationSamples].forEach(v => natural(v, true));
  [policy.minimumBlockingPrecision, policy.minimumCommentPrecision, policy.maximumCalibrationError].forEach(rate);
  if (policy.minimumBlockingPrecision < 0.98 || policy.minimumCommentPrecision < 0.9
    || policy.minimumBlockingPrecision < policy.minimumCommentPrecision) throw new Error("Trust precision floors cannot be weakened");
  if (typeof evidence.verified !== "boolean" || typeof evidence.contradictory !== "boolean") throw new Error("Invalid evidence attestation");
  if (quality) {
    [quality.version, quality.datasetVersion, quality.ruleFamily].forEach(nonempty);
    if (quality.ruleFamily !== input.ruleFamily) throw new Error("Quality family scope mismatch");
    [quality.pendingLabels, quality.truePositives, quality.falsePositives, quality.emittingRepositories, quality.cleanRepositories,
      quality.blockingTruePositives, quality.blockingFalsePositives, quality.blockingEmittingRepositories, quality.blockingCleanRepositories].forEach(v => natural(v));
    if (typeof quality.sourceVerified !== "boolean" || quality.cleanRepositories > quality.emittingRepositories
      || quality.emittingRepositories > quality.truePositives + quality.falsePositives
      || quality.blockingTruePositives > quality.truePositives || quality.blockingFalsePositives > quality.falsePositives
      || quality.blockingEmittingRepositories > quality.emittingRepositories
      || quality.blockingCleanRepositories > quality.blockingEmittingRepositories
      || quality.blockingEmittingRepositories > quality.blockingTruePositives + quality.blockingFalsePositives) throw new Error("Inconsistent trust quality counts");
  }
  if (calibration) {
    [calibration.version, calibration.datasetVersion, calibration.ruleFamily].forEach(nonempty);
    if (calibration.ruleFamily !== input.ruleFamily) throw new Error("Calibration family scope mismatch");
    if (calibration.scope !== "blocking" && calibration.scope !== "comment") throw new Error("Invalid calibration scope");
    [calibration.samples, calibration.independentRepositories].forEach(v => natural(v));
    rate(calibration.expectedCalibrationError);
    if (typeof calibration.sourceVerified !== "boolean" || calibration.independentRepositories > calibration.samples) throw new Error("Invalid calibration attestation");
  }
  if (mandatoryException) {
    [mandatoryException.policyVersion, mandatoryException.auditRef, mandatoryException.reason].forEach(nonempty);
    mandatoryException.ruleIds.forEach(nonempty);
    if (!mandatoryException.ruleIds.includes(input.ruleId)) throw new Error("Mandatory exception is outside rule scope");
  }
}

function lowerBound(quality: VerifiedFamilyQuality | undefined, blocking: boolean): number | null {
  if (!quality) return null;
  const n = blocking ? quality.blockingEmittingRepositories : quality.emittingRepositories;
  if (n === 0) return null;
  const p = (blocking ? quality.blockingCleanRepositories : quality.cleanRepositories) / n;
  const z = 1.959963984540054;
  return Math.max(0, (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n));
}

function insufficientReasons(input: ReviewerTrustInput): readonly string[] {
  const { quality, calibration, policy } = input;
  const blocking = input.severity === "high" || input.severity === "critical";
  return [
    ...(!quality?.sourceVerified ? ["Missing verified family quality"] : []),
    ...(!calibration?.sourceVerified ? ["Missing verified calibration"] : []),
    ...(quality && quality.pendingLabels > 0 ? ["Pending family adjudication"] : []),
    ...(quality && quality.truePositives + quality.falsePositives < policy.minimumFindings ? ["Insufficient adjudicated findings"] : []),
    ...(quality && quality.emittingRepositories < policy.minimumRepositories ? ["Insufficient independent emitting repositories"] : []),
    ...(quality && blocking && (quality.blockingTruePositives + quality.blockingFalsePositives < policy.minimumFindings
      || quality.blockingEmittingRepositories < policy.minimumRepositories) ? ["Insufficient independent blocking evidence"] : []),
    ...(calibration && (calibration.samples < policy.minimumCalibrationSamples
      || calibration.independentRepositories < policy.minimumRepositories) ? ["Insufficient independent calibration evidence"] : []),
    ...(quality && calibration && quality.datasetVersion !== calibration.datasetVersion ? ["Calibration dataset does not match family quality"] : []),
    ...(calibration && calibration.scope !== (blocking ? "blocking" : "comment") ? ["Calibration severity scope mismatch"] : []),
  ];
}

export function assessReviewerTrust(input: ReviewerTrustInput): ReviewerTrustResult {
  validate(input);
  const { quality, calibration, policy, evidence, mandatoryException } = input;
  const total = quality ? quality.truePositives + quality.falsePositives : 0;
  const precision = quality && total > 0 ? quality.truePositives / total : null;
  const blockingTotal = quality ? quality.blockingTruePositives + quality.blockingFalsePositives : 0;
  const blockingPrecision = quality && blockingTotal > 0 ? quality.blockingTruePositives / blockingTotal : null;
  const highSeverity = input.severity === "high" || input.severity === "critical";
  const repositoryReliabilityLowerBound = lowerBound(quality, highSeverity);
  const insufficient = insufficientReasons(input);
  const evidenceFailures = [
    ...(!evidence.verified ? ["Finding evidence is unverified"] : []),
    ...(evidence.contradictory ? ["Finding evidence is contradictory"] : []),
  ];
  const calibrationFails = calibration !== undefined && calibration.expectedCalibrationError > policy.maximumCalibrationError;
  const floor = highSeverity ? policy.minimumBlockingPrecision : policy.minimumCommentPrecision;
  const relevantPrecision = highSeverity ? blockingPrecision : precision;
  const qualityFails = relevantPrecision === null || relevantPrecision < floor
    || repositoryReliabilityLowerBound === null || repositoryReliabilityLowerBound < floor;
  const mandatory = mandatoryException !== undefined && evidenceFailures.length === 0;
  const eligible = insufficient.length === 0 && evidenceFailures.length === 0 && !calibrationFails && !qualityFails;
  const status = mandatory ? "mandatory-policy-exception" : evidenceFailures.length > 0 ? "ineligible"
    : insufficient.length > 0 ? "insufficient-evidence" : eligible ? "eligible" : "ineligible";
  return {
    schemaVersion: "1", policyVersion: policy.version, ruleId: input.ruleId, ruleFamily: input.ruleFamily,
    qualityVersion: quality?.version ?? null, datasetVersion: quality?.datasetVersion ?? null,
    calibrationVersion: calibration?.version ?? null, evidenceContractVersion: evidence.contractVersion,
    status, basis: mandatory ? "mandatory-policy" : "measured-quality",
    canBlock: mandatory || (highSeverity && eligible), canComment: mandatory || eligible,
    precision, blockingPrecision, repositoryReliabilityLowerBound,
    reasons: [...evidenceFailures, ...insufficient,
      ...(calibrationFails ? ["Calibration error exceeds policy budget"] : []),
      ...(qualityFails ? ["Precision or independent repository reliability below policy floor"] : []),
      ...(mandatoryException ? [`Mandatory policy ${mandatoryException.policyVersion}: ${mandatoryException.reason}`] : [])],
    exceptionAuditRef: mandatoryException?.auditRef ?? null,
  };
}
