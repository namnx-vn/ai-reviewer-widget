import { describe, expect, it } from "vitest";
import { createDefaultReviewUseCases } from "../../review";
import { runIsolatedShadow } from "../index";

const input = { metadata: { eventId: "shadow", recordedAt: "2026-09-15T00:00:00.000Z", candidateId: "candidate",
  artifactDigest: "sha256:candidate", baselineVersion: 0, reviewRunId: "run", repositoryId: "repo" },
  mode: "repository" as const, files: [{ path: "src/example.ts", content: "export const name = 'safe';" }],
  maximumFiles: 10, maximumSourceBytes: 10000, maximumDurationMs: 5000 };
describe("actual isolated shadow review", () => {
  it("runs two trusted shared compositions and binds verifier to exact output without raw source", async () => {
    const result = await runIsolatedShadow(input, { production: createDefaultReviewUseCases(), candidate: createDefaultReviewUseCases() });
    expect(result.candidateOnly).toEqual([]); expect(result.productionOnly).toEqual([]);
    expect(await result.verification.verify(result.receipt)).toBe(true);
    expect(await result.verification.verify({ ...result.receipt, artifactDigest: "swapped" })).toBe(false);
    expect(result.receipt).not.toHaveProperty("files");
  });
  it("rejects oversized sources before analysis and rejects elapsed overruns", async () => {
    const compositions = { production: createDefaultReviewUseCases(), candidate: createDefaultReviewUseCases() };
    await expect(runIsolatedShadow({ ...input, maximumSourceBytes: 1 }, compositions)).rejects.toThrow("source budget");
    let time = 0;
    await expect(runIsolatedShadow({ ...input, maximumDurationMs: 10 }, { ...compositions, now() { time += 20; return time; } })).rejects.toThrow("deadline");
  });
  it("uses shared PR use cases with base context when reviewing a PR", async () => {
    const result = await runIsolatedShadow({ ...input, mode: "pull-request", pullRequest: { title: "Safe change", baseFiles: input.files } },
      { production: createDefaultReviewUseCases(), candidate: createDefaultReviewUseCases() });
    expect(await result.verification.verify(result.receipt)).toBe(true);
  });
  it("supports a cooperative executor and reports its hard isolation limitation", async () => {
    const result = await runIsolatedShadow(input, { production: createDefaultReviewUseCases(), candidate: createDefaultReviewUseCases(),
      execution: { async execute(operation, signal) { expect(signal.aborted).toBe(false); return operation(); } } });
    expect(result.execution).toBe("injected-cooperative"); expect(result.hardResourceIsolation).toBe(false);
  });
  it("aborts cooperative work on a deadline and does not issue a shadow receipt", async () => {
    let aborted = false;
    await expect(runIsolatedShadow({ ...input, maximumDurationMs: 1 }, { production: createDefaultReviewUseCases(), candidate: createDefaultReviewUseCases(),
      execution: { execute(_operation, signal) { return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new Error("Cancelled")); }, { once: true });
      }); } } })).rejects.toThrow("deadline");
    expect(aborted).toBe(true);
  });
});
