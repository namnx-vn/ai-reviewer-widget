import type { LearningEvent } from "./contracts";
import { resolveLearningOutcomes } from "./outcomes";

export interface RegressionSourceCapture {
  readonly repositoryId: string; readonly snapshotRef: string; readonly sourceHeadSha: string; readonly contentDigest: string;
  readonly files: readonly { readonly path: string; readonly content: string }[];
}
export interface PendingRegressionMetadata {
  readonly schemaVersion: 1; readonly state: "pending"; readonly draftId: string; readonly repositoryId: string;
  readonly outcomeRef: string; readonly evidenceRef: string; readonly originalAdjudicatorId: string;
  readonly snapshotRef: string; readonly sourceHeadSha: string; readonly contentDigest: string;
  readonly ruleId: string; readonly findingFingerprint: string; readonly expectation: "must-find" | "must-not-find";
  readonly sourceFidelity: "exact-capture";
}
export interface StoredRegressionDraft { readonly metadata: PendingRegressionMetadata; readonly capture: RegressionSourceCapture }
// Raw source belongs only to this external fixture adapter, never learning journal events.
export interface RegressionFixturePort {
  readCapture(snapshotRef: string): Promise<RegressionSourceCapture>;
  // Create an immutable draft; implementations must reject existing draft identities.
  writeDraft(draft: StoredRegressionDraft): Promise<void>;
  readDraft(draftId: string): Promise<StoredRegressionDraft>;
}
export interface IndependentRegressionVerifier {
  verify(draft: StoredRegressionDraft): Promise<{ readonly verified: boolean; readonly adjudicatorId?: string;
    readonly draftId?: string; readonly contentDigest?: string; readonly expectation?: "must-find" | "must-not-find" }>;
}
function validateCapture(capture: RegressionSourceCapture): void {
  if (!/^[a-f0-9]{40}$/.test(capture.sourceHeadSha) || !/^[a-f0-9]{64}$/.test(capture.contentDigest)
    || !capture.repositoryId.trim() || !capture.snapshotRef.trim() || capture.files.length === 0 || capture.files.length > 1000
    || new Set(capture.files.map((file) => file.path)).size !== capture.files.length
    || capture.files.some((file) => !file.path.trim() || typeof file.content !== "string")
    || capture.files.reduce((bytes, file) => bytes + new TextEncoder().encode(file.content).byteLength, 0) > 10_000_000) throw new Error("Invalid regression capture provenance or source limits.");
}
export async function generateRegressionDraft(events: readonly LearningEvent[], outcomeRef: string, draftId: string,
  fixtures: RegressionFixturePort): Promise<PendingRegressionMetadata> {
  const outcome = events.find((event) => event.eventId === outcomeRef);
  if (outcome?.kind !== "outcome" || !outcome.verified || !outcome.evidenceRef || !outcome.adjudicatorId
    || !["false-positive", "missed-bug"].includes(outcome.verdict)
    || !resolveLearningOutcomes(events, outcome.repositoryId).some((resolved) => resolved.state === "verified" && resolved.outcomeRefs.includes(outcomeRef))) throw new Error("Regression requires an active verified failure.");
  if (!draftId.trim() || draftId.length > 2000) throw new Error("Invalid regression draft ID.");
  const review = events.find((event) => event.kind === "review" && event.reviewRunId === outcome.reviewRunId && event.repositoryId === outcome.repositoryId);
  if (review?.kind !== "review") throw new Error("Regression requires a pinned review capture.");
  const capture = structuredClone(await fixtures.readCapture(review.snapshotRef)); validateCapture(capture);
  if (capture.repositoryId !== outcome.repositoryId || capture.snapshotRef !== review.snapshotRef) throw new Error("Regression capture identity mismatch.");
  const metadata: PendingRegressionMetadata = { schemaVersion: 1, state: "pending", draftId, repositoryId: outcome.repositoryId,
    outcomeRef, evidenceRef: outcome.evidenceRef, originalAdjudicatorId: outcome.adjudicatorId, snapshotRef: capture.snapshotRef,
    sourceHeadSha: capture.sourceHeadSha, contentDigest: capture.contentDigest, ruleId: outcome.ruleId, findingFingerprint: outcome.findingFingerprint,
    expectation: outcome.verdict === "missed-bug" ? "must-find" : "must-not-find", sourceFidelity: "exact-capture" };
  await fixtures.writeDraft({ metadata: structuredClone(metadata), capture }); return metadata;
}
export async function verifyGeneratedRegression(metadata: PendingRegressionMetadata, fixtures: RegressionFixturePort,
  verifier: IndependentRegressionVerifier): Promise<Omit<PendingRegressionMetadata, "state"> & { readonly state: "verified"; readonly adjudicatorId: string }> {
  const stored = structuredClone(await fixtures.readDraft(metadata.draftId)); validateCapture(stored.capture);
  const original = structuredClone(await fixtures.readCapture(metadata.snapshotRef)); validateCapture(original);
  if (JSON.stringify(stored.metadata) !== JSON.stringify(metadata) || stored.capture.snapshotRef !== metadata.snapshotRef
    || stored.capture.repositoryId !== metadata.repositoryId || stored.capture.sourceHeadSha !== metadata.sourceHeadSha
    || stored.capture.contentDigest !== metadata.contentDigest || original.repositoryId !== metadata.repositoryId
    || original.snapshotRef !== metadata.snapshotRef || original.sourceHeadSha !== metadata.sourceHeadSha
    || original.contentDigest !== metadata.contentDigest || JSON.stringify(original.files) !== JSON.stringify(stored.capture.files)) throw new Error("Regression verification provenance mismatch.");
  const receipt = await verifier.verify(stored);
  if (!receipt.verified || !receipt.adjudicatorId?.trim() || receipt.adjudicatorId === metadata.originalAdjudicatorId
    || receipt.draftId !== metadata.draftId || receipt.contentDigest !== metadata.contentDigest
    || receipt.expectation !== metadata.expectation) throw new Error("Independent regression verification failed.");
  return { ...metadata, state: "verified", adjudicatorId: receipt.adjudicatorId };
}
