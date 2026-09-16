import { describe, expect, it } from "vitest";
import type { LearningEvent } from "../contracts";
import { buildRepositoryAdaptation } from "../adaptation";

const outcome = { version: 1 as const, kind: "outcome" as const, eventId: "accepted", recordedAt: "2026-01-01T00:00:00Z", repositoryId: "repo",
  reviewRunId: "run", findingFingerprint: "finding", ruleId: "security.no-eval", verdict: "accepted" as const,
  verified: true, adjudicatorId: "human", evidenceRef: "evidence" };
const options = { profileVersion: "profile:1", policyVersion: "policy:2", evaluatedAt: "2026-09-16T00:00:00Z",
  staleAfterMs: 1000, minimumTrustedSamples: 2, globalPriors: { "security.no-eval": 0.9 } };
describe("advisory repository and historical intelligence", () => {
  it("deduplicates accepted/fixed, isolates repo, sparse falls back global and historical decisions are stale", () => {
    const events: readonly LearningEvent[] = [outcome, { ...outcome, eventId: "fixed", verdict: "fixed" }];
    const result = buildRepositoryAdaptation(events, "repo", options);
    expect(result).toMatchObject({ advisoryOnly: true, mandatoryControls: "preserved", rules: [{ trustedSamples: 1, priorSource: "global", precisionPrior: 0.9 }],
      historical: [{ stale: true, correctnessEvidence: true }] });
    expect(buildRepositoryAdaptation(events, "other", options).rules).toMatchObject([{ trustedSamples: 0, priorSource: "global" }]);
  });
  it("never treats ignored/accepted-risk/conflicting labels as truth and never modifies input", () => {
    const events: readonly LearningEvent[] = [outcome, { ...outcome, eventId: "risk", findingFingerprint: "risk", verdict: "accepted-risk" },
      { ...outcome, eventId: "ignored", findingFingerprint: "ignored", verdict: "ignored" }, { ...outcome, eventId: "conflict", verdict: "false-positive" }];
    const before = structuredClone(events); const result = buildRepositoryAdaptation(events, "repo", options);
    expect(result.rules).toMatchObject([{ trustedSamples: 0, priorSource: "global" }]);
    expect(result.historical.filter((entry) => entry.verdict === "accepted-risk" || entry.verdict === "ignored").every((entry) => !entry.correctnessEvidence)).toBe(true);
    expect(events).toEqual(before);
  });
  it("uses scoped priors only with enough trusted examples and excludes future labels", () => {
    const events: readonly LearningEvent[] = [outcome, { ...outcome, eventId: "fp", findingFingerprint: "other", verdict: "false-positive" },
      { ...outcome, eventId: "future", findingFingerprint: "future", recordedAt: "2030-01-01T00:00:00Z" },
      { version: 1, kind: "review", eventId: "clean", recordedAt: outcome.recordedAt, repositoryId: "repo", reviewRunId: "clean", snapshotRef: "capture:clean", mode: "repository", findingFingerprints: [] }];
    const result = buildRepositoryAdaptation(events, "repo", options);
    expect(result.rules).toMatchObject([{ trustedSamples: 2, priorSource: "repository", precisionPrior: 0.5 }]);
    expect(result.historical).toHaveLength(2); expect(result.reviewHistory).toMatchObject([{ findingCount: 0, stale: true }]);
    expect(() => buildRepositoryAdaptation(events, "repo", { ...options, globalPriors: { bad: 2 } })).toThrow("policy");
  });
});
