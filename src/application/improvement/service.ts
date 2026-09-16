import type { AdjudicationVerificationPort, CandidateEvaluation, EvaluationRequest, EventIdentity, HumanAuthorization, ImprovementCandidate,
  LearningEvent, LearningOutcome, LearningPersistencePort, LearningReview, ProductionArtifact,
  PromotionAuthorizationPort, PromotionQualityPort, PromotionQualityReceipt, RegressionVerification, ShadowReview, ShadowVerificationPort } from "./contracts";
import { mineLearningFailures, resolveLearningOutcomes, summarizeLearningOutcomes } from "./outcomes";
import { assertLearningEvent } from "./validation";

export interface LearningDependencies {
  readonly store: LearningPersistencePort; readonly quality: PromotionQualityPort;
  readonly authorization?: PromotionAuthorizationPort; readonly initialProduction: ProductionArtifact;
  readonly adjudication?: AdjudicationVerificationPort;
  readonly shadow?: ShadowVerificationPort;
  readonly minimumShadowReviews: number; readonly maximumShadowDurationMs: number;
}
export function createLearningService(dependencies: LearningDependencies) {
  if (!Number.isSafeInteger(dependencies.minimumShadowReviews) || dependencies.minimumShadowReviews < 1
    || !Number.isFinite(dependencies.maximumShadowDurationMs) || dependencies.maximumShadowDurationMs <= 0
    || !Number.isSafeInteger(dependencies.initialProduction.version) || dependencies.initialProduction.version < 0) {
    throw new Error("Invalid learning policy.");
  }
  const current = (events: readonly LearningEvent[]): ProductionArtifact => {
    let artifact = { ...dependencies.initialProduction };
    for (const event of events) {
      if (event.kind !== "release") continue;
      if (event.previousVersion !== artifact.version || event.productionVersion !== artifact.version + 1) throw new Error("Invalid production release lineage.");
      artifact = { version: event.productionVersion, candidateId: event.candidateId, artifactDigest: event.artifactDigest };
    }
    return artifact;
  };
  const read = async () => {
    const snapshot = await dependencies.store.read();
    const baseline = snapshot.events.find((event) => event.kind === "baseline");
    if (baseline?.kind === "baseline") {
      if (baseline.productionVersion !== dependencies.initialProduction.version || baseline.candidateId !== dependencies.initialProduction.candidateId
        || baseline.artifactDigest !== dependencies.initialProduction.artifactDigest) throw new Error("Initial production configuration conflicts with durable baseline.");
      if (snapshot.events[0] !== baseline || snapshot.events.filter((event) => event.kind === "baseline").length !== 1) throw new Error("Invalid durable baseline order.");
      return snapshot;
    }
    if (snapshot.events.length !== 0) throw new Error("Learning store lacks durable baseline.");
    const event: LearningEvent = { version: 1, kind: "baseline", eventId: "baseline:initial", recordedAt: "1970-01-01T00:00:00.000Z",
      productionVersion: dependencies.initialProduction.version, candidateId: dependencies.initialProduction.candidateId,
      artifactDigest: dependencies.initialProduction.artifactDigest };
    assertLearningEvent(event); await dependencies.store.append(event, 0);
    return { revision: 1, events: [event] };
  };
  const candidateFor = (events: readonly LearningEvent[], candidateId: string) => {
    const candidate = events.find((event) => event.kind === "candidate" && event.candidateId === candidateId);
    if (candidate?.kind !== "candidate") throw new Error("Unknown improvement candidate.");
    return candidate;
  };
  const append = async (event: LearningEvent, revision: number) => {
    assertLearningEvent(event); await dependencies.store.append(event, revision); return structuredClone(event);
  };
  const evaluate = async (request: EvaluationRequest, events: readonly LearningEvent[]) => {
    const candidate = candidateFor(events, request.candidateId);
    if (candidate.artifactDigest !== request.artifactDigest || candidate.parentVersion !== current(events).version
      || request.baselineVersion !== current(events).version) throw new Error("Evaluation lineage does not match current production.");
    const receipt = await dependencies.quality.evaluate(structuredClone(request));
    if (receipt.candidateId !== request.candidateId || receipt.artifactDigest !== request.artifactDigest
      || receipt.baselineVersion !== request.baselineVersion || receipt.datasetVersion !== request.datasetVersion
      || receipt.policyVersion !== request.policyVersion || receipt.evaluationRef !== request.evaluationRef) {
      throw new Error("Quality receipt identity mismatch.");
    }
    return receipt;
  };
  const requirePassing = (receipt: PromotionQualityReceipt) => {
    if (receipt.status !== "pass" || !receipt.verified || !receipt.independentHoldout || receipt.pendingLabels !== 0
      || !receipt.mandatoryControlsPreserved) throw new Error("Candidate lacks verified independent passing evidence.");
  };
  return {
    async initialize() { return current((await read()).events); },
    async recordReview(input: LearningReview) {
      const snapshot = await read();
      if (snapshot.events.some((event) => event.kind === "review" && event.reviewRunId === input.reviewRunId)) throw new Error("Review already recorded.");
      return append({ ...input, version: 1, kind: "review" }, snapshot.revision);
    },
    async recordOutcome(input: LearningOutcome) {
      const snapshot = await read();
      const review = snapshot.events.find((event) => event.kind === "review" && event.reviewRunId === input.reviewRunId);
      if (review?.kind !== "review" || review.repositoryId !== input.repositoryId) throw new Error("Unknown outcome review/repository.");
      const reportedMiss = snapshot.events.some((event) => event.kind === "outcome" && event.reviewRunId === input.reviewRunId
        && event.repositoryId === input.repositoryId && event.findingFingerprint === input.findingFingerprint
        && event.ruleId === input.ruleId && event.verdict === "missed-bug");
      if (input.verdict !== "missed-bug" && !review.findingFingerprints.includes(input.findingFingerprint) && !reportedMiss) throw new Error("Outcome finding is absent from review.");
      if (input.verified && !await dependencies.adjudication?.verifyOutcome(structuredClone(input))) throw new Error("Trusted adjudication authorization is required.");
      if (input.supersedes !== undefined) {
        if (!input.verified) throw new Error("Only adjudicated outcomes may resolve conflicts.");
        for (const ref of input.supersedes) {
          const prior = snapshot.events.find((event) => event.eventId === ref);
          if (prior?.kind !== "outcome" || prior.repositoryId !== input.repositoryId
            || prior.findingFingerprint !== input.findingFingerprint || prior.ruleId !== input.ruleId) throw new Error("Invalid superseded outcome reference.");
        }
      }
      return append({ ...input, version: 1, kind: "outcome" }, snapshot.revision);
    },
    async outcomes(repositoryId: string) { return resolveLearningOutcomes((await read()).events, repositoryId); },
    async mineFailures(repositoryId: string) { return mineLearningFailures((await read()).events, repositoryId); },
    async metrics(repositoryId: string) { return summarizeLearningOutcomes((await read()).events, repositoryId); },
    async production() { return current((await read()).events); },
    async propose(input: ImprovementCandidate) {
      const snapshot = await read();
      if (snapshot.events.some((event) => event.kind === "candidate" && event.candidateId === input.candidateId)
        || input.parentVersion !== current(snapshot.events).version) throw new Error("Candidate identity or lineage is invalid.");
      const failures = mineLearningFailures(snapshot.events, input.repositoryId).flatMap((opportunity) => opportunity.outcomeRefs);
      if (input.outcomeRefs.some((ref) => !failures.includes(ref))) throw new Error("Proposal requires verified repository-scoped failures.");
      return append({ ...input, version: 1, kind: "candidate" }, snapshot.revision);
    },
    async verifyRegression(input: RegressionVerification) {
      const snapshot = await read();
      const candidate = candidateFor(snapshot.events, input.candidateId);
      const outcome = snapshot.events.find((event) => event.eventId === input.outcomeRef);
      if (!candidate.outcomeRefs.includes(input.outcomeRef) || outcome?.kind !== "outcome" || !outcome.verified
        || (outcome.verdict === "missed-bug" ? "must-find" : "must-not-find") !== input.expectation) throw new Error("Regression does not match verified failure.");
      if (!await dependencies.adjudication?.verifyRegression(structuredClone(input))) throw new Error("Trusted regression verification is required.");
      return append({ ...input, version: 1, kind: "regression" }, snapshot.revision);
    },
    async evaluate(input: EventIdentity & EvaluationRequest): Promise<CandidateEvaluation> {
      const snapshot = await read();
      const receipt = await evaluate(input, snapshot.events);
      const event = { ...receipt, eventId: input.eventId, recordedAt: input.recordedAt, version: 1 as const, kind: "evaluation" as const };
      await append(event, snapshot.revision); return event;
    },
    async recordShadow(input: ShadowReview) {
      const snapshot = await read();
      const candidate = candidateFor(snapshot.events, input.candidateId);
      const review = snapshot.events.find((event) => event.kind === "review" && event.reviewRunId === input.reviewRunId);
      if (review?.kind !== "review" || review.repositoryId !== input.repositoryId || candidate.repositoryId !== input.repositoryId
        || input.artifactDigest !== candidate.artifactDigest || input.baselineVersion !== current(snapshot.events).version
        || input.durationMs > dependencies.maximumShadowDurationMs) throw new Error("Shadow identity or resource budget mismatch.");
      if (snapshot.events.some((event) => event.kind === "shadow" && event.candidateId === input.candidateId
        && event.reviewRunId === input.reviewRunId)) throw new Error("Duplicate shadow sample.");
      if (!await dependencies.shadow?.verify(structuredClone(input))) throw new Error("Trusted isolated shadow verification is required.");
      return append({ ...input, version: 1, kind: "shadow" }, snapshot.revision);
    },
    async promote(input: EventIdentity & HumanAuthorization & { readonly candidateId: string }) {
      const snapshot = await read();
      const candidate = candidateFor(snapshot.events, input.candidateId);
      const baseline = current(snapshot.events);
      const evaluations = snapshot.events.filter((event) => event.kind === "evaluation" && event.candidateId === candidate.candidateId);
      const evaluation = evaluations[evaluations.length - 1];
      if (evaluation?.kind !== "evaluation") throw new Error("Candidate has no evaluation.");
      requirePassing(evaluation);
      requirePassing(await evaluate(evaluation, snapshot.events));
      if (resolveLearningOutcomes(snapshot.events, candidate.repositoryId).some((outcome) => outcome.state === "pending")) throw new Error("Repository has pending outcome labels.");
      const activeFailures = mineLearningFailures(snapshot.events, candidate.repositoryId).flatMap((failure) => failure.outcomeRefs);
      if (candidate.outcomeRefs.some((ref) => !activeFailures.includes(ref))) throw new Error("Candidate failure evidence was superseded.");
      const regressions = snapshot.events.filter((event) => event.kind === "regression" && event.candidateId === candidate.candidateId);
      if (candidate.outcomeRefs.some((ref) => !regressions.some((event) => event.kind === "regression" && event.outcomeRef === ref))) throw new Error("Candidate lacks verified regressions.");
      const shadows = snapshot.events.filter((event) => event.kind === "shadow" && event.candidateId === candidate.candidateId
        && event.artifactDigest === candidate.artifactDigest && event.baselineVersion === baseline.version);
      if (shadows.length < dependencies.minimumShadowReviews) throw new Error("Insufficient isolated shadow reviews.");
      if (!await dependencies.authorization?.authorize({ ...input, action: "promote", artifactDigest: candidate.artifactDigest,
        previousVersion: baseline.version })) throw new Error("Explicit human promotion authorization is required.");
      return append({ ...input, version: 1, kind: "release", action: "promote", previousVersion: baseline.version,
        productionVersion: baseline.version + 1, artifactDigest: candidate.artifactDigest, evaluationRef: evaluation.evaluationRef }, snapshot.revision);
    },
    async rollback(input: EventIdentity & HumanAuthorization & { readonly targetVersion: number }) {
      const snapshot = await read(); const baseline = current(snapshot.events);
      const release = snapshot.events.find((event) => event.kind === "release" && event.productionVersion === input.targetVersion);
      const target = input.targetVersion === dependencies.initialProduction.version ? dependencies.initialProduction
        : release?.kind === "release" ? { candidateId: release.candidateId, artifactDigest: release.artifactDigest, version: release.productionVersion } : undefined;
      if (target === undefined || target.version >= baseline.version) throw new Error("Invalid rollback target.");
      if (!await dependencies.authorization?.authorize({ ...input, action: "rollback", artifactDigest: target.artifactDigest,
        previousVersion: baseline.version })) throw new Error("Explicit human rollback authorization is required.");
      const { targetVersion: _targetVersion, ...identity } = input;
      void _targetVersion;
      return append({ ...identity, version: 1, kind: "release", action: "rollback", previousVersion: baseline.version,
        productionVersion: baseline.version + 1, candidateId: target.candidateId, artifactDigest: target.artifactDigest }, snapshot.revision);
    },
  };
}
export type LearningService = ReturnType<typeof createLearningService>;
