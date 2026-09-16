import { fingerprintReviewFinding, type ReviewResult } from "../../domain/review";
import type { PullRequestReviewInput, ReviewUseCases, SourceFile } from "../review";
import type { ShadowReview, ShadowVerificationPort } from "./contracts";

export interface IsolatedShadowInput {
  readonly metadata: Omit<ShadowReview, "durationMs" | "productionFindingRefs" | "candidateFindingRefs">;
  readonly mode: "repository" | "pull-request";
  readonly files: readonly SourceFile[];
  readonly pullRequest?: Omit<PullRequestReviewInput, "files">;
  readonly maximumFiles: number; readonly maximumSourceBytes: number; readonly maximumDurationMs: number;
}
export interface ShadowCompositions {
  readonly production: ReviewUseCases; readonly candidate: ReviewUseCases; readonly now?: () => number;
  readonly execution?: ShadowExecutionPort;
}
export interface ShadowExecutionPort {
  execute(operation: () => Promise<ReviewResult>, signal: AbortSignal): Promise<ReviewResult>;
}
function receiptIdentity(input: ShadowReview): string {
  return JSON.stringify([input.eventId, input.recordedAt, input.candidateId, input.artifactDigest, input.baselineVersion,
    input.reviewRunId, input.repositoryId, input.durationMs, input.productionFindingRefs, input.candidateFindingRefs]);
}
// Compositions are trusted application use cases; artifact text is never loaded or executed here.
// The deadline discards late asynchronous results. Synchronous AST work needs a process adapter
// for hard CPU/memory termination; input caps and elapsed checks still apply to both runs.
export async function runIsolatedShadow(input: IsolatedShadowInput, compositions: ShadowCompositions): Promise<{
  readonly receipt: ShadowReview; readonly verification: ShadowVerificationPort;
  readonly candidateOnly: readonly string[]; readonly productionOnly: readonly string[];
  readonly execution: "in-process" | "injected-cooperative"; readonly hardResourceIsolation: false;
}> {
  const source = [...input.files, ...(input.pullRequest?.baseFiles ?? [])];
  if (![input.maximumFiles, input.maximumSourceBytes, input.maximumDurationMs].every((value) => Number.isFinite(value) && value > 0)) throw new Error("Invalid shadow resource limits.");
  const bytes = source.reduce((total, file) => total + new TextEncoder().encode(file.content).byteLength, 0);
  if (source.length > input.maximumFiles || bytes > input.maximumSourceBytes) throw new Error("Shadow source budget exceeded.");
  if (input.mode === "pull-request" && input.pullRequest === undefined) throw new Error("Shadow PR context is required.");
  const now = compositions.now ?? Date.now;
  const start = now();
  let expired = false;
  const cancellation = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = async (composition: ReviewUseCases): Promise<ReviewResult> => input.mode === "repository"
    ? composition.reviewFiles(structuredClone(input.files))
    : composition.reviewPullRequest({ ...structuredClone(input.pullRequest ?? { title: "Shadow review" }), files: structuredClone(input.files) });
  const run = (composition: ReviewUseCases) => compositions.execution === undefined
    ? operation(composition) : compositions.execution.execute(() => operation(composition), cancellation.signal);
  const work = async () => {
    const production = await run(compositions.production);
    if (expired || now() - start > input.maximumDurationMs) throw new Error("Shadow deadline exceeded.");
    const candidate = await run(compositions.candidate);
    const durationMs = now() - start;
    if (expired || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > input.maximumDurationMs) throw new Error("Shadow deadline exceeded.");
    const productionFindingRefs = production.findings.map((finding) => fingerprintReviewFinding(finding)).sort();
    const candidateFindingRefs = candidate.findings.map((finding) => fingerprintReviewFinding(finding)).sort();
    const receipt: ShadowReview = { ...input.metadata, durationMs, productionFindingRefs, candidateFindingRefs };
    const identity = receiptIdentity(receipt);
    return { receipt, verification: { async verify(value: ShadowReview) { return receiptIdentity(value) === identity; } },
      candidateOnly: candidateFindingRefs.filter((ref) => !productionFindingRefs.includes(ref)),
      productionOnly: productionFindingRefs.filter((ref) => !candidateFindingRefs.includes(ref)),
      execution: compositions.execution === undefined ? "in-process" as const : "injected-cooperative" as const, hardResourceIsolation: false as const };
  };
  try {
    return await Promise.race([work(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { expired = true; cancellation.abort(); reject(new Error("Shadow deadline exceeded.")); }, input.maximumDurationMs);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
