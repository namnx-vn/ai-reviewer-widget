import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileLearningStore } from "../improvement-store";
import { createLearningService, type PromotionQualityPort } from "../../application/improvement";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function directory() { const value = mkdtempSync(resolve(tmpdir(), "learning-test-")); directories.push(value); return value; }
const event = { version: 1 as const, kind: "review" as const, eventId: "review", recordedAt: "2026-09-15T00:00:00.000Z",
  repositoryId: "repo", reviewRunId: "run", snapshotRef: "snapshot:sha", mode: "repository" as const, findingFingerprints: [] };
describe("durable learning journal", () => {
  it("anchors baseline on disk and rejects changed initial configuration across reload", async () => {
    const root = directory();
    const quality: PromotionQualityPort = { async evaluate(request) { return { ...request, status: "insufficient-evidence",
      verified: false, independentHoldout: false, pendingLabels: 0, mandatoryControlsPreserved: false, reasons: ["No evaluation"] }; } };
    const dependencies = { store: createFileLearningStore(root), quality,
      initialProduction: { version: 0, candidateId: "base", artifactDigest: "sha256:base" }, minimumShadowReviews: 3, maximumShadowDurationMs: 5000 };
    await createLearningService(dependencies).initialize();
    await createLearningService({ ...dependencies, store: createFileLearningStore(root) }).recordReview(event);
    expect(await createLearningService({ ...dependencies, store: createFileLearningStore(root) }).production()).toEqual(dependencies.initialProduction);
    await expect(createLearningService({ ...dependencies, initialProduction: { ...dependencies.initialProduction, artifactDigest: "sha256:changed" } }).initialize()).rejects.toThrow("durable baseline");
    expect((await dependencies.store.read()).events.map((entry) => entry.kind)).toEqual(["baseline", "review"]);
  });
  it("reloads metadata only and rejects stale competing writers", async () => {
    const root = directory(); const first = createFileLearningStore(root); const second = createFileLearningStore(root);
    await first.append(event, 0);
    await expect(second.append({ ...event, eventId: "other" }, 0)).rejects.toThrow("revision conflict");
    expect(await createFileLearningStore(root).read()).toEqual({ revision: 1, events: [event] });
    expect(readdirSync(root)).toEqual(["000000000001.json"]);
    expect(readFileSync(resolve(root, "000000000001.json"), "utf8")).not.toContain("source");
  });
  it("fails closed on malformed schemas, revision gaps and duplicate event identities", async () => {
    const root = directory(); const store = createFileLearningStore(root); await store.append(event, 0);
    writeFileSync(resolve(root, "000000000002.json"), JSON.stringify({ ...event, source: "raw content" }));
    await expect(store.read()).rejects.toThrow("metadata");
    writeFileSync(resolve(root, "000000000002.json"), JSON.stringify(event));
    await expect(store.read()).rejects.toThrow("Duplicate");
    rmSync(resolve(root, "000000000002.json"));
    writeFileSync(resolve(root, "000000000003.json"), JSON.stringify({ ...event, eventId: "third" }));
    await expect(store.read()).rejects.toThrow("gap");
  });
});
