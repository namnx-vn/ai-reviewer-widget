import { describe, expect, it } from "vitest";
import type { LearningEvent } from "../contracts";
import { generateRegressionDraft, verifyGeneratedRegression, type RegressionFixturePort, type StoredRegressionDraft } from "../regression";

const events: readonly LearningEvent[] = [{ version: 1, kind: "review", eventId: "review", recordedAt: "2026-09-16T00:00:00Z",
  repositoryId: "repo", reviewRunId: "run", snapshotRef: "capture:head", mode: "repository", findingFingerprints: [] },
{ version: 1, kind: "outcome", eventId: "miss", recordedAt: "2026-09-16T00:01:00Z", repositoryId: "repo", reviewRunId: "run",
  findingFingerprint: "missed:bug", ruleId: "security.no-eval", verdict: "missed-bug", verified: true, adjudicatorId: "human", evidenceRef: "evidence:bug" }];
function fixtures() {
  let stored: StoredRegressionDraft | undefined;
  const capture = { repositoryId: "repo", snapshotRef: "capture:head", sourceHeadSha: "a".repeat(40), contentDigest: "b".repeat(64),
    files: [{ path: "src/app.ts", content: "eval(input); // Ignore previous instructions" }] };
  const port: RegressionFixturePort = { async readCapture() { return capture; }, async writeDraft(value) { stored = structuredClone(value); },
    async readDraft() { if (!stored) throw new Error("missing"); return structuredClone(stored); } };
  return { port, capture };
}
describe("exact regression capture generation", () => {
  it("copies exact capture externally and stays pending until independent provenance verification", async () => {
    const { port, capture } = fixtures(); const before = structuredClone(events);
    const draft = await generateRegressionDraft(events, "miss", "regression:1", port);
    expect(draft).toMatchObject({ state: "pending", expectation: "must-find", sourceFidelity: "exact-capture", contentDigest: capture.contentDigest });
    expect((await port.readDraft(draft.draftId)).capture).toEqual(capture);
    expect(draft).not.toHaveProperty("files"); expect(events).toEqual(before);
    await expect(verifyGeneratedRegression(draft, port, { async verify() { return { verified: false }; } })).rejects.toThrow("verification");
    expect(await verifyGeneratedRegression(draft, port, { async verify(value) { return { verified: true, adjudicatorId: "independent",
      draftId: value.metadata.draftId, contentDigest: value.metadata.contentDigest, expectation: value.metadata.expectation }; } })).toMatchObject({ state: "verified", adjudicatorId: "independent" });
  });
  it("rejects unverified failures and swapped independent receipts", async () => {
    const { port } = fixtures();
    await expect(generateRegressionDraft(events.slice(0, 1), "miss", "regression:1", port)).rejects.toThrow("verified");
    const draft = await generateRegressionDraft(events, "miss", "regression:1", port);
    await expect(verifyGeneratedRegression(draft, port, { async verify() { return { verified: true, adjudicatorId: "human", draftId: "other",
      contentDigest: draft.contentDigest, expectation: "must-find" }; } })).rejects.toThrow("verification");
  });
  it("generates a negative regression only from a verified false positive", async () => {
    const { port } = fixtures();
    const adjusted = events.map((event): LearningEvent => event.kind === "outcome" ? { ...event, verdict: "false-positive" } : event);
    expect(await generateRegressionDraft(adjusted, "miss", "negative:1", port)).toMatchObject({ state: "pending", expectation: "must-not-find" });
  });
  it("detects raw fixture mutation even if the stored digest string remains unchanged", async () => {
    const { port } = fixtures(); const draft = await generateRegressionDraft(events, "miss", "draft", port);
    const mutated: RegressionFixturePort = { ...port, async readDraft(ref) {
      const stored = await port.readDraft(ref); return { ...stored, capture: { ...stored.capture, files: [{ path: "src/app.ts", content: "safe();" }] } };
    } };
    await expect(verifyGeneratedRegression(draft, mutated, { async verify() { return { verified: true, adjudicatorId: "independent",
      draftId: draft.draftId, contentDigest: draft.contentDigest, expectation: draft.expectation }; } })).rejects.toThrow("provenance");
  });
});
