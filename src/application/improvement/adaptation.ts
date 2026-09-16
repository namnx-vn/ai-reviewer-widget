import type { LearningEvent, OutcomeVerdict } from "./contracts";
import { resolveLearningOutcomes, summarizeLearningOutcomes } from "./outcomes";

export interface RepositoryAdaptationOptions {
  readonly profileVersion: string; readonly policyVersion: string; readonly evaluatedAt: string;
  readonly staleAfterMs: number; readonly minimumTrustedSamples: number; readonly globalPriors: Readonly<Record<string, number>>;
}
export interface HistoricalReviewSignal {
  readonly findingFingerprint: string; readonly ruleId: string; readonly verdict: OutcomeVerdict;
  readonly outcomeRefs: readonly string[]; readonly recordedAt: string; readonly stale: boolean;
  readonly correctnessEvidence: boolean; readonly conflicting: boolean;
}
export interface RepositoryAdaptationProfile {
  readonly schemaVersion: 1; readonly repositoryId: string; readonly profileVersion: string; readonly policyVersion: string;
  readonly evaluatedAt: string; readonly advisoryOnly: true; readonly mandatoryControls: "preserved";
  readonly historyIsContextOnly: true;
  readonly rules: readonly { readonly ruleId: string; readonly trustedSamples: number; readonly pendingSamples: number;
    readonly priorSource: "global" | "repository"; readonly precisionPrior: number | null; readonly evidenceRefs: readonly string[] }[];
  readonly historical: readonly HistoricalReviewSignal[];
  readonly reviewHistory: readonly { readonly reviewRunId: string; readonly snapshotRef: string; readonly recordedAt: string;
    readonly findingCount: number; readonly stale: boolean }[];
}
export function buildRepositoryAdaptation(events: readonly LearningEvent[], repositoryId: string,
  options: RepositoryAdaptationOptions): RepositoryAdaptationProfile {
  const evaluatedAt = Date.parse(options.evaluatedAt);
  if (!repositoryId.trim() || !options.profileVersion.trim() || !options.policyVersion.trim() || !Number.isFinite(evaluatedAt)
    || !Number.isSafeInteger(options.minimumTrustedSamples) || options.minimumTrustedSamples < 1
    || !Number.isFinite(options.staleAfterMs) || options.staleAfterMs < 0
    || Object.values(options.globalPriors).some((prior) => !Number.isFinite(prior) || prior < 0 || prior > 1)) throw new Error("Invalid repository adaptation policy.");
  // Ignore records from the future rather than permitting future labels to influence current priors.
  const past = events.filter((event) => Date.parse(event.recordedAt) <= evaluatedAt);
  const resolved = resolveLearningOutcomes(past, repositoryId);
  const summaries = summarizeLearningOutcomes(past, repositoryId);
  const stale = (recordedAt: string) => evaluatedAt - Date.parse(recordedAt) > options.staleAfterMs;
  const historical: HistoricalReviewSignal[] = resolved.map((outcome) => {
    const references = past.filter((event) => outcome.outcomeRefs.includes(event.eventId));
    const recordedAt = references.map((event) => event.recordedAt).sort().reverse()[0];
    return { findingFingerprint: outcome.findingFingerprint, ruleId: outcome.ruleId, verdict: outcome.verdict,
      outcomeRefs: [...outcome.outcomeRefs], recordedAt, stale: stale(recordedAt), conflicting: outcome.state === "pending",
      correctnessEvidence: outcome.state === "verified" && ["accepted", "fixed", "false-positive", "missed-bug"].includes(outcome.verdict) };
  });
  const ruleIds = [...new Set([...Object.keys(options.globalPriors), ...summaries.map((summary) => summary.ruleId)])].sort();
  const rules = ruleIds.map((ruleId) => {
    const summary = summaries.find((entry) => entry.ruleId === ruleId);
    const trustedSamples = (summary?.truePositives ?? 0) + (summary?.falsePositives ?? 0);
    const useRepository = trustedSamples >= options.minimumTrustedSamples && summary?.precision !== null && summary?.precision !== undefined;
    return { ruleId, trustedSamples, pendingSamples: summary?.pending ?? 0,
      priorSource: useRepository ? "repository" as const : "global" as const,
      precisionPrior: useRepository ? summary.precision : options.globalPriors[ruleId] ?? null,
      evidenceRefs: resolved.filter((outcome) => outcome.ruleId === ruleId && outcome.state === "verified"
        && ["accepted", "fixed", "false-positive"].includes(outcome.verdict)).flatMap((outcome) => outcome.evidenceRefs).sort() };
  });
  const reviewHistory = past.filter((event) => event.kind === "review" && event.repositoryId === repositoryId).map((event) => {
    if (event.kind !== "review") throw new Error("Invalid review history event.");
    return { reviewRunId: event.reviewRunId, snapshotRef: event.snapshotRef, recordedAt: event.recordedAt,
      findingCount: event.findingFingerprints.length, stale: stale(event.recordedAt) };
  }).sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.reviewRunId.localeCompare(right.reviewRunId));
  return { schemaVersion: 1, repositoryId, profileVersion: options.profileVersion, policyVersion: options.policyVersion,
    evaluatedAt: options.evaluatedAt, advisoryOnly: true, mandatoryControls: "preserved", historyIsContextOnly: true, rules, historical, reviewHistory };
}
