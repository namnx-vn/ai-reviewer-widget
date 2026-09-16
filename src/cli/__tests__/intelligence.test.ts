import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileLearningStore } from "../improvement-store";
import { runIntelligenceCli } from "../intelligence";

const directories: string[] = [];
afterEach(() => { directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })); });
function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), "review-intelligence-"));
  directories.push(cwd);
  return cwd;
}
function input(cwd: string, name: string, value: unknown): string {
  const path = join(cwd, name);
  writeFileSync(path, JSON.stringify(value), "utf8");
  return path;
}
function io(cwd: string) {
  const stdout: string[] = [], stderr: string[] = [];
  return { cwd, stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text), output: stdout, errors: stderr };
}
const clean = {
  repositoryId: "test/repository", snapshotId: "sha-clean", expectedPaths: ["src/clean.ts"],
  files: [{ path: "src/clean.ts", content: "export const value = 1;" }], expectedFindings: [],
};

describe("continuous review operator", () => {
  it("reloads immutable genesis instead of replacing it with the current runtime digest", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    await createFileLearningStore(store).append({ version: 1, kind: "baseline", eventId: "genesis", recordedAt: "2026-01-01T00:00:00.000Z",
      productionVersion: 0, candidateId: "previous-runtime", artifactDigest: "b".repeat(64) }, 0);
    expect(await runIntelligenceCli(["production", store], terminal)).toBe(0);
    expect(terminal.output.join("")).toContain("previous-runtime");
    expect((await createFileLearningStore(store).read()).events).toHaveLength(1);
  });

  it("records zero-finding repository reviews durably without storing source", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    expect(await runIntelligenceCli(["repository", input(cwd, "snapshot.json", clean), store], terminal)).toBe(0);
    const state = await createFileLearningStore(store).read();
    expect(state.events.filter((event) => event.kind === "review")).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain("export const value");
    expect(state.events.find((event) => event.kind === "review")).toMatchObject({ kind: "review", mode: "repository", findingFingerprints: [] });
    expect(terminal.output.join("")).toContain('"completeness"');
  });

  it("reports incomplete snapshots and still records the operated review", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    expect(await runIntelligenceCli(["repository", input(cwd, "snapshot.json", { ...clean, files: [] }), store], terminal)).toBe(1);
    expect(terminal.output.join("")).toContain("MISSING_FILE");
    expect((await createFileLearningStore(store).read()).events.filter((event) => event.kind === "review")).toHaveLength(1);
  });

  it("records base/head PR evaluation through the same pipeline", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    const request = { id: "pr-1", title: "Rename constant", base: clean,
      head: { ...clean, snapshotId: "sha-next", files: [{ path: "src/clean.ts", content: "export const next = 1;" }] },
      expectedIntroducedFindings: [] };
    expect(await runIntelligenceCli(["pr", input(cwd, "pr.json", request), store], terminal)).toBe(0);
    expect(terminal.output.join("")).toContain('"parity": true');
    expect((await createFileLearningStore(store).read()).events.find((event) => event.kind === "review")).toMatchObject({ mode: "pull-request" });
  });

  it("rejects malformed source and forged learning metadata before persistence", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    expect(await runIntelligenceCli(["repository", input(cwd, "bad.json", { ...clean, files: [{ path: "src/clean.ts", content: 42 }] }), store], terminal)).toBe(2);
    expect(await runIntelligenceCli(["event", input(cwd, "event.json", { version: 1, kind: "review", source: "secret source" }), store], terminal)).toBe(2);
    expect(terminal.errors).toHaveLength(2);
  });

  it("requires explicit adjudication authorization for verified missed-bug feedback", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    await runIntelligenceCli(["repository", input(cwd, "snapshot.json", clean), store], terminal);
    const review = (await createFileLearningStore(store).read()).events.find((event) => event.kind === "review");
    if (review?.kind !== "review") throw new Error("Missing recorded review");
    const event = { version: 1, kind: "outcome", eventId: "missed-1", recordedAt: "2026-09-15T00:00:00.000Z",
      repositoryId: clean.repositoryId, reviewRunId: review.reviewRunId, findingFingerprint: "missed-owner-check",
      ruleId: "security.authorization.owner-check", verdict: "missed-bug", verified: true,
      adjudicatorId: "local-reviewer", evidenceRef: "source-audit:owner-check" };
    const path = input(cwd, "outcome.json", event);
    expect(await runIntelligenceCli(["event", path, store], terminal)).toBe(2);
    expect(await runIntelligenceCli(["event", path, store, "--authorize-adjudication"], terminal)).toBe(0);
    expect((await createFileLearningStore(store).read()).events.filter((entry) => entry.kind === "outcome")).toHaveLength(1);
  });

  it("never accepts a caller-supplied passing quality receipt", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    const path = input(cwd, "quality.json", { version: 1, kind: "evaluation", status: "pass", verified: true });
    expect(await runIntelligenceCli(["event", path, store], terminal)).toBe(2);
    expect(await runIntelligenceCli(["quality", path], terminal)).toBe(2);
    expect(readFileSync(path, "utf8")).toContain('"pass"');
  });

  it("keeps metadata imports from changing baseline/release and rejects unauthorized release commands", async () => {
    const cwd = workspace(), terminal = io(cwd), store = join(cwd, "learning");
    const baseline = { version: 1, kind: "baseline", eventId: "replace-genesis", recordedAt: "2026-01-01T00:00:00.000Z",
      productionVersion: 0, candidateId: "forged-baseline", artifactDigest: "b".repeat(64) };
    expect(await runIntelligenceCli(["event", input(cwd, "baseline.json", baseline), store], terminal)).toBe(2);
    expect(await runIntelligenceCli(["promote", store, "candidate", "actor", "approval"], terminal)).toBe(2);
    expect(await runIntelligenceCli(["rollback", store, "0", "actor", "approval"], terminal)).toBe(2);
    expect((await createFileLearningStore(store).read()).events).toHaveLength(0);
  });

  it("rejects ambiguous commands and provides help without creating a journal", async () => {
    const cwd = workspace(), terminal = io(cwd);
    expect(await runIntelligenceCli(["--help"], terminal)).toBe(0);
    expect(await runIntelligenceCli(["unknown"], terminal)).toBe(2);
    expect(await runIntelligenceCli(["production", "learning", "extra"], terminal)).toBe(2);
    expect(await runIntelligenceCli(["failures", "learning"], terminal)).toBe(2);
    expect(await runIntelligenceCli(["event", "event.json", "learning", "--unrecognized"], terminal)).toBe(2);
  });
});
