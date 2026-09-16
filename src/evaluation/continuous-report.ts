import type { ReviewUseCases } from "../application/review";
import { buildRealWorldObservationReport } from "./real-world-observation";
import type { RealWorldEvaluationCase } from "./real-world";
import { evaluatePullRequestReview, evaluateRepositoryReview, type PullRequestEvaluationInput } from "./repository-review";

export async function buildContinuousReliabilityReport(useCases: ReviewUseCases, input: {
  readonly corpus: readonly RealWorldEvaluationCase[];
  readonly pullRequest: PullRequestEvaluationInput;
}) {
  const corpus = buildRealWorldObservationReport(useCases, input.corpus);
  const repository = await evaluateRepositoryReview(useCases, input.pullRequest.head);
  const pullRequest = await evaluatePullRequestReview(useCases, input.pullRequest);
  return {
    schemaVersion: 1,
    corpus,
    repository,
    pullRequest,
    promotionEligibility: {
      status: "insufficient-evidence" as const,
      reasons: [
        "Existing corpus has been inspected and is not independent holdout.",
        ...(corpus.summary.excludedCaseIds.length ? ["Invalid minimized fixture provenance requires reconstruction."] : []),
        "Offline synthetic repository and PR snapshots verify integration, not empirical production precision.",
        "Approved policy and verified independent holdout receipts are required before promotion.",
      ],
    },
  };
}
