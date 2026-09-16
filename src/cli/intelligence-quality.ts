import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LearningPersistencePort, PromotionQualityPort } from "../application/improvement";
import { createDefaultReviewUseCases } from "../application/review";
import { evaluatePromotionQuality, parsePromotionQualityInput, type PromotionQualityInput, type PromotionQualityPolicy, type QualityCaseCounts } from "../evaluation";
import { assertApprovedPromotionPolicy } from "./promotion-policy";
import { evaluateRepositoryReview, parseRepositoryReviewInput } from "../evaluation/repository-review";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid source adjudication audit.");
  return value;
}

function sameCounts(value: unknown, counts: QualityCaseCounts): boolean {
  const audit = object(value);
  return Object.entries(counts).every(([key, count]) => audit[key] === count);
}

/** Resolve the exact local capture and human-reviewed labels; flags authorize audit trust, never model self-labels. */
export async function verifyQualitySourceEvidence(input: PromotionQualityInput, cwd: string): Promise<boolean> {
  for (const entry of input.cases) {
    if (entry.fidelity !== "verified-source") return false;
    const source = readFileSync(resolve(cwd, entry.snapshotRef), "utf8");
    const snapshot = parseRepositoryReviewInput(JSON.parse(source));
    const capture = await evaluateRepositoryReview(createDefaultReviewUseCases(), snapshot);
    if (capture.completeness.status !== "complete") return false;
    const audit = object(JSON.parse(readFileSync(resolve(cwd, entry.adjudicationRef), "utf8")));
    if (audit.schemaVersion !== 1 || audit.caseId !== entry.caseId || audit.repositoryId !== entry.repositoryId
      || audit.observedAt !== entry.observedAt || audit.ruleFamily !== input.ruleFamily
      || audit.candidateId !== input.candidateId || audit.artifactDigest !== input.artifactDigest
      || audit.baselineVersion !== input.baselineVersion || audit.datasetVersion !== input.datasetVersion
      || audit.policyVersion !== input.policy.policyVersion || audit.verdictsComplete !== true
      || typeof audit.adjudicatorId !== "string" || !audit.adjudicatorId.trim()
      || typeof audit.sourceHeadSha !== "string" || !/^[a-f0-9]{40}$/.test(audit.sourceHeadSha)
      || snapshot.repositoryId !== entry.repositoryId || snapshot.snapshotId !== audit.sourceHeadSha
      || audit.snapshotDigest !== createHash("sha256").update(source).digest("hex")
      || !sameCounts(audit.candidate, entry.candidate) || !sameCounts(audit.production, entry.production)) return false;
  }
  return true;
}

export function createFilePromotionQualityPort(options: {
  readonly cwd: string; readonly store: LearningPersistencePort; readonly evidenceAuthorized: boolean;
  readonly approvedPolicy?: Readonly<PromotionQualityPolicy>;
}): PromotionQualityPort {
  return {
    async evaluate(request) {
      const input = parsePromotionQualityInput(JSON.parse(readFileSync(resolve(options.cwd, request.evaluationRef), "utf8")));
      assertApprovedPromotionPolicy(input.policy, options.approvedPolicy);
      if (input.candidateId !== request.candidateId || input.artifactDigest !== request.artifactDigest
        || input.baselineVersion !== String(request.baselineVersion) || input.datasetVersion !== request.datasetVersion
        || input.policy.policyVersion !== request.policyVersion) throw new Error("Evaluation bundle identity mismatch.");
      const state = await options.store.read();
      const candidate = state.events.find((event) => event.kind === "candidate" && event.candidateId === request.candidateId);
      if (candidate?.kind !== "candidate" || candidate.artifactDigest !== request.artifactDigest
        || createHash("sha256").update(readFileSync(resolve(options.cwd, candidate.artifactRef))).digest("hex") !== request.artifactDigest) {
        throw new Error("Candidate artifact changed or is not registered.");
      }
      const result = evaluatePromotionQuality(input);
      const verified = options.evidenceAuthorized && await verifyQualitySourceEvidence(input, options.cwd);
      return {
        ...request, status: verified ? result.qualityStatus : "insufficient-evidence", verified,
        independentHoldout: verified, pendingLabels: result.metrics.pendingLabels,
        mandatoryControlsPreserved: input.cases.every((entry) => entry.candidate.protectedPositiveDetected === entry.candidate.protectedPositiveExpected
          && entry.candidate.criticalPositiveDetected === entry.candidate.criticalPositiveExpected),
        reasons: [...result.reasons, ...(verified ? [] : ["Source capture and adjudication audits are not authorized and verified."])],
      };
    },
  };
}
