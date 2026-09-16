import type { FailureOpportunity, LearningEvent, LearningOutcome, LearningRuleMetrics, OutcomeVerdict, ResolvedOutcome } from "./contracts";

function family(verdict: OutcomeVerdict): string {
  return verdict === "accepted" || verdict === "fixed" ? "true-positive" : verdict;
}
export function resolveLearningOutcomes(events: readonly LearningEvent[], repositoryId: string): readonly ResolvedOutcome[] {
  const outcomes = events.filter((event): event is LearningEvent & LearningOutcome => event.kind === "outcome" && event.repositoryId === repositoryId);
  const keys = [...new Set(outcomes.map((event) => JSON.stringify([event.findingFingerprint, event.ruleId])))].sort();
  return keys.map((key) => {
    const group = outcomes.filter((event) => JSON.stringify([event.findingFingerprint, event.ruleId]) === key);
    const superseded = new Set(group.filter((event) => event.verified).flatMap((event) => event.supersedes ?? []));
    const active = group.filter((event) => !superseded.has(event.eventId));
    const latest = active[active.length - 1] ?? group[group.length - 1];
    const verified = active.every((event) => event.verified) && new Set(active.map((event) => family(event.verdict))).size === 1;
    return { repositoryId, findingFingerprint: latest.findingFingerprint, ruleId: latest.ruleId,
      state: verified ? "verified" : "pending", verdict: latest.verdict,
      outcomeRefs: active.map((event) => event.eventId).sort(),
      evidenceRefs: [...new Set(active.flatMap((event) => event.evidenceRef === undefined ? [] : [event.evidenceRef]))].sort() };
  });
}
export function mineLearningFailures(events: readonly LearningEvent[], repositoryId: string): readonly FailureOpportunity[] {
  const failures = resolveLearningOutcomes(events, repositoryId).filter((outcome) => outcome.state === "verified"
    && ["false-positive", "missed-bug", "duplicate", "not-actionable"].includes(outcome.verdict));
  const keys = [...new Set(failures.map((outcome) => JSON.stringify([outcome.ruleId, outcome.verdict])))].sort();
  return keys.map((key) => {
    const group = failures.filter((outcome) => JSON.stringify([outcome.ruleId, outcome.verdict]) === key);
    return { repositoryId, ruleId: group[0].ruleId, verdict: group[0].verdict, sampleCount: group.length,
      lowConfidence: group.length < 5, outcomeRefs: group.flatMap((outcome) => outcome.outcomeRefs).sort(),
      regressionRefs: group.flatMap((outcome) => outcome.evidenceRefs).sort() };
  });
}
// Outcome rates are descriptive developer signals, never independent holdout promotion metrics.
export function summarizeLearningOutcomes(events: readonly LearningEvent[], repositoryId: string): readonly LearningRuleMetrics[] {
  const outcomes = resolveLearningOutcomes(events, repositoryId);
  return [...new Set(outcomes.map((outcome) => outcome.ruleId))].sort().map((ruleId) => {
    const group = outcomes.filter((outcome) => outcome.ruleId === ruleId);
    const verified = group.filter((outcome) => outcome.state === "verified");
    const count = (...verdicts: readonly OutcomeVerdict[]) => verified.filter((outcome) => verdicts.includes(outcome.verdict)).length;
    const truePositives = count("accepted", "fixed"); const falsePositives = count("false-positive"); const missedBugs = count("missed-bug");
    const pending = group.length - verified.length;
    return { repositoryId, ruleId, total: group.length, verified: verified.length, pending, truePositives, falsePositives, missedBugs,
      duplicates: count("duplicate"), notActionable: count("not-actionable"), ignored: count("ignored"), acceptedRisk: count("accepted-risk"),
      precision: pending > 0 || truePositives + falsePositives === 0 ? null : truePositives / (truePositives + falsePositives),
      recall: pending > 0 || truePositives + missedBugs === 0 ? null : truePositives / (truePositives + missedBugs) };
  });
}
