import { describe, expect, it } from "vitest";
import { createLearningService, createInMemoryLearningStore, parseLearningEvent, type LearningPersistencePort, type PromotionQualityPort } from "../index";

const timestamp = "2026-09-15T00:00:00.000Z";
const gate: PromotionQualityPort = { async evaluate(request) {
  return { ...request, status: "pass", verified: true, independentHoldout: true,
    pendingLabels: 0, mandatoryControlsPreserved: true, reasons: [] };
} };
function setup() {
  return createLearningService({ store: createInMemoryLearningStore(), quality: gate,
    adjudication: { async verifyOutcome() { return true; }, async verifyRegression() { return true; } },
    initialProduction: { candidateId: "production", artifactDigest: "sha256:production", version: 1 },
    minimumShadowReviews: 2, maximumShadowDurationMs: 100 });
}
async function prepared(quality: PromotionQualityPort = gate, store: LearningPersistencePort = createInMemoryLearningStore()) {
  const dependencies = { store, quality,
    adjudication: { async verifyOutcome() { return true; }, async verifyRegression() { return true; } },
    authorization: { async authorize() { return true; } },
    shadow: { async verify() { return true; } },
    initialProduction: { candidateId: "production", artifactDigest: "sha256:production", version: 1 },
    minimumShadowReviews: 2, maximumShadowDurationMs: 100 };
  const service = createLearningService(dependencies);
  await service.recordReview(review); await service.recordOutcome(outcome);
  await service.propose({ eventId: "proposal", recordedAt: timestamp, candidateId: "candidate", artifactDigest: "sha256:patched",
    artifactRef: "artifact:patched", parentVersion: 1, repositoryId: "repo", outcomeRefs: ["miss"], mandatoryControls: "preserved" });
  await service.verifyRegression({ eventId: "regression", recordedAt: timestamp, candidateId: "candidate", outcomeRef: "miss",
    regressionRef: "regression:bug", adjudicatorId: "human:reviewer", expectation: "must-find" });
  await service.evaluate({ eventId: "evaluation", recordedAt: timestamp, candidateId: "candidate", artifactDigest: "sha256:patched",
    baselineVersion: 1, evaluationRef: "eval:1", datasetVersion: "dataset:holdout:1", policyVersion: "policy:1" });
  for (let index = 0; index < 2; index += 1) {
    await service.recordReview({ ...review, eventId: `review-${index}`, reviewRunId: `run-${index}` });
    await service.recordShadow({ eventId: `shadow-${index}`, recordedAt: timestamp, candidateId: "candidate", artifactDigest: "sha256:patched",
      baselineVersion: 1, reviewRunId: `run-${index}`, repositoryId: "repo", durationMs: 10,
      productionFindingRefs: [], candidateFindingRefs: ["candidate:bug"] });
  }
  return { service, store, dependencies };
}
const review = { eventId: "review", recordedAt: timestamp, repositoryId: "repo", reviewRunId: "run",
  snapshotRef: "snapshot:abc", mode: "repository" as const, findingFingerprints: [] };
const outcome = { eventId: "miss", recordedAt: timestamp, repositoryId: "repo", reviewRunId: "run",
  findingFingerprint: "missed:bug", ruleId: "security.no-eval", verdict: "missed-bug" as const,
  verified: true, adjudicatorId: "human:reviewer", evidenceRef: "repro:bug" };

describe("bounded learning", () => {
  it("records clean reviews and mines verified missed bugs per repository", async () => {
    const service = setup();
    await service.recordReview(review);
    await service.recordOutcome(outcome);
    expect(await service.mineFailures("repo")).toEqual([{ repositoryId: "repo", ruleId: "security.no-eval",
      verdict: "missed-bug", sampleCount: 1, lowConfidence: true, outcomeRefs: ["miss"], regressionRefs: ["repro:bug"] }]);
    expect(await service.mineFailures("other")).toEqual([]);
  });
  it("keeps conflicting and untrusted labels pending, deduplicates accepted then fixed", async () => {
    const service = setup();
    await service.recordReview({ ...review, findingFingerprints: ["finding"] });
    await service.recordOutcome({ ...outcome, findingFingerprint: "finding", verdict: "accepted" });
    await service.recordOutcome({ ...outcome, eventId: "fixed", findingFingerprint: "finding", verdict: "fixed" });
    expect(await service.outcomes("repo")).toMatchObject([{ state: "verified", verdict: "fixed" }]);
    expect(await service.metrics("repo")).toMatchObject([{ total: 1, truePositives: 1, precision: 1, recall: 1 }]);
    await service.recordOutcome({ ...outcome, eventId: "fp", findingFingerprint: "finding", verdict: "false-positive" });
    expect(await service.outcomes("repo")).toMatchObject([{ state: "pending" }]);
    expect(await service.metrics("repo")).toMatchObject([{ pending: 1, precision: null, recall: null }]);
    expect(await service.mineFailures("repo")).toEqual([]);
    await service.recordOutcome({ ...outcome, eventId: "resolved", findingFingerprint: "finding", verdict: "false-positive",
      supersedes: ["miss", "fixed", "fp"] });
    expect(await service.outcomes("repo")).toMatchObject([{ state: "verified", verdict: "false-positive" }]);
  });
  it("requires actual adjudication authorization and keeps untrusted reports pending", async () => {
    const service = createLearningService({ store: createInMemoryLearningStore(), quality: gate,
      initialProduction: { version: 0, candidateId: "base", artifactDigest: "base:digest" }, minimumShadowReviews: 3, maximumShadowDurationMs: 5000 });
    await service.recordReview(review);
    await expect(service.recordOutcome(outcome)).rejects.toThrow("adjudication");
    await service.recordOutcome({ ...outcome, verified: false, adjudicatorId: undefined, evidenceRef: undefined });
    expect(await service.outcomes("repo")).toMatchObject([{ state: "pending" }]);
    expect(await service.mineFailures("repo")).toEqual([]);
  });
  it("promotes and rolls back only versioned artifacts and replays durable release identity", async () => {
    const { service, dependencies } = await prepared();
    const authorization = { actorId: "human:operator", authorizationRef: "approval:123", recordedAt: timestamp };
    await service.promote({ ...authorization, eventId: "promote", candidateId: "candidate" });
    expect(await createLearningService(dependencies).production()).toEqual({ version: 2, candidateId: "candidate", artifactDigest: "sha256:patched" });
    await service.rollback({ ...authorization, eventId: "rollback", targetVersion: 1 });
    expect(await createLearningService(dependencies).production()).toEqual({ version: 3, candidateId: "production", artifactDigest: "sha256:production" });
  });
  it("rejects receipt swapping, insufficient evidence, missing authorization and stale production", async () => {
    const { service, dependencies } = await prepared();
    const input = { eventId: "promote", recordedAt: timestamp, candidateId: "candidate", actorId: "human", authorizationRef: "approval" };
    await expect(createLearningService({ ...dependencies, authorization: undefined }).promote(input)).rejects.toThrow("authorization");
    await expect(createLearningService({ ...dependencies, quality: { async evaluate(request) {
      return { ...await gate.evaluate(request), artifactDigest: "swapped" };
    } } }).promote(input)).rejects.toThrow("identity");
    await expect(createLearningService({ ...dependencies, quality: { async evaluate(request) {
      return { ...await gate.evaluate(request), status: "insufficient-evidence" };
    } } }).promote(input)).rejects.toThrow("passing evidence");
    await service.promote(input);
    await expect(service.promote({ ...input, eventId: "promote-again" })).rejects.toThrow("lineage");
  });
  it("rejects pending outcomes, oversized shadow runs, raw source and weakened controls", async () => {
    const { service } = await prepared();
    await service.recordOutcome({ ...outcome, eventId: "pending", findingFingerprint: "missed:another", verified: false });
    await expect(service.promote({ eventId: "promote", recordedAt: timestamp, candidateId: "candidate", actorId: "human", authorizationRef: "approval" })).rejects.toThrow("pending");
    await expect(service.recordShadow({ eventId: "too-slow", recordedAt: timestamp, candidateId: "candidate", artifactDigest: "sha256:patched",
      baselineVersion: 1, reviewRunId: "run", repositoryId: "repo", durationMs: 101, productionFindingRefs: [], candidateFindingRefs: [] })).rejects.toThrow("budget");
    expect(() => parseLearningEvent({ ...review, version: 1, kind: "review", source: "secret source" })).toThrow("metadata");
    expect(() => parseLearningEvent({ eventId: "proposal", recordedAt: timestamp, version: 1, kind: "candidate", candidateId: "candidate",
      artifactDigest: "patched", artifactRef: "patched", parentVersion: 1, repositoryId: "repo", outcomeRefs: ["miss"], mandatoryControls: "disabled" })).toThrow("metadata");
  });
  it("does not count duplicate shadows or accept untrusted shadow receipts", async () => {
    const { service, dependencies } = await prepared();
    const input = { eventId: "shadow-again", recordedAt: timestamp, candidateId: "candidate", artifactDigest: "sha256:patched",
      baselineVersion: 1, reviewRunId: "run-0", repositoryId: "repo", durationMs: 10, productionFindingRefs: [], candidateFindingRefs: [] };
    await expect(service.recordShadow(input)).rejects.toThrow("Duplicate");
    await expect(createLearningService({ ...dependencies, shadow: undefined }).recordShadow({ ...input, reviewRunId: "run" })).rejects.toThrow("verification");
  });
  it("blocks stale failure lineage after supersession and limits promotion samples", async () => {
    const { service, dependencies } = await prepared();
    const input = { eventId: "promote", recordedAt: timestamp, candidateId: "candidate", actorId: "human", authorizationRef: "approval" };
    await expect(createLearningService({ ...dependencies, minimumShadowReviews: 3 }).promote(input)).rejects.toThrow("shadow reviews");
    await service.recordOutcome({ ...outcome, eventId: "resolved", verdict: "ignored", supersedes: ["miss"] });
    await expect(service.promote(input)).rejects.toThrow("superseded");
  });
  it("optimistic revision preconditions reject two releases from the same snapshot", async () => {
    const { service, dependencies } = await prepared();
    const input = { recordedAt: timestamp, candidateId: "candidate", actorId: "human", authorizationRef: "approval" };
    const results = await Promise.allSettled([service.promote({ ...input, eventId: "first" }),
      createLearningService(dependencies).promote({ ...input, eventId: "second" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await service.production()).toMatchObject({ version: 2 });
  });
});
