import type { LearningEvent } from "./contracts";

const verdicts = ["accepted", "fixed", "false-positive", "missed-bug", "ignored", "duplicate", "not-actionable", "accepted-risk"];
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 2048; }
function list(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 10000 && value.every(text); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
export function isLearningEvent(value: unknown): value is LearningEvent {
  if (!record(value) || value.version !== 1 || !text(value.eventId) || !text(value.recordedAt)
    || !Number.isFinite(Date.parse(value.recordedAt))) return false;
  const base = ["version", "kind", "eventId", "recordedAt"];
  const strings = (...keys: string[]) => keys.every((key) => text(value[key]));
  switch (value.kind) {
    case "baseline": return exact(value, [...base, "productionVersion", "candidateId", "artifactDigest"])
      && strings("candidateId", "artifactDigest") && integer(value.productionVersion);
    case "review": return exact(value, [...base, "repositoryId", "reviewRunId", "snapshotRef", "mode", "findingFingerprints"])
      && strings("repositoryId", "reviewRunId", "snapshotRef") && ["pull-request", "repository"].includes(String(value.mode))
      && list(value.findingFingerprints);
    case "outcome": return exact(value, [...base, "repositoryId", "reviewRunId", "findingFingerprint", "ruleId", "verdict", "verified", "adjudicatorId", "evidenceRef", "supersedes"])
      && strings("repositoryId", "reviewRunId", "findingFingerprint", "ruleId") && verdicts.includes(String(value.verdict))
      && typeof value.verified === "boolean" && (!value.verified || strings("adjudicatorId", "evidenceRef"))
      && (value.adjudicatorId === undefined || text(value.adjudicatorId))
      && (value.evidenceRef === undefined || text(value.evidenceRef)) && (value.supersedes === undefined || list(value.supersedes));
    case "candidate": return exact(value, [...base, "candidateId", "artifactDigest", "artifactRef", "parentVersion", "repositoryId", "outcomeRefs", "mandatoryControls"])
      && strings("candidateId", "artifactDigest", "artifactRef", "repositoryId") && integer(value.parentVersion)
      && list(value.outcomeRefs) && value.outcomeRefs.length > 0 && value.mandatoryControls === "preserved";
    case "regression": return exact(value, [...base, "candidateId", "outcomeRef", "regressionRef", "adjudicatorId", "expectation"])
      && strings("candidateId", "outcomeRef", "regressionRef", "adjudicatorId") && ["must-find", "must-not-find"].includes(String(value.expectation));
    case "evaluation": return exact(value, [...base, "candidateId", "artifactDigest", "baselineVersion", "evaluationRef", "datasetVersion", "policyVersion", "status", "verified", "independentHoldout", "pendingLabels", "mandatoryControlsPreserved", "reasons"])
      && strings("candidateId", "artifactDigest", "evaluationRef", "datasetVersion", "policyVersion") && integer(value.baselineVersion)
      && ["pass", "fail", "insufficient-evidence"].includes(String(value.status)) && integer(value.pendingLabels)
      && typeof value.verified === "boolean" && typeof value.independentHoldout === "boolean"
      && typeof value.mandatoryControlsPreserved === "boolean" && list(value.reasons);
    case "shadow": return exact(value, [...base, "candidateId", "artifactDigest", "baselineVersion", "reviewRunId", "repositoryId", "durationMs", "productionFindingRefs", "candidateFindingRefs"])
      && strings("candidateId", "artifactDigest", "reviewRunId", "repositoryId") && integer(value.baselineVersion)
      && typeof value.durationMs === "number" && Number.isFinite(value.durationMs) && value.durationMs >= 0
      && list(value.productionFindingRefs) && list(value.candidateFindingRefs);
    case "release": return exact(value, [...base, "candidateId", "artifactDigest", "version", "action", "previousVersion", "actorId", "authorizationRef", "evaluationRef", "productionVersion"])
      && strings("candidateId", "artifactDigest", "actorId", "authorizationRef") && integer(value.previousVersion)
      && integer(value.productionVersion) && ["promote", "rollback"].includes(String(value.action))
      && (value.evaluationRef === undefined || text(value.evaluationRef));
    default: return false;
  }
}
export function assertLearningEvent(value: unknown): asserts value is LearningEvent {
  if (!isLearningEvent(value)) throw new Error("Invalid learning metadata event.");
}
export function parseLearningEvent(value: unknown): LearningEvent {
  assertLearningEvent(value); return structuredClone(value);
}
