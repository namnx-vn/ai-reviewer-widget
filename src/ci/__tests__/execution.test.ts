import { describe, expect, it, vi } from "vitest";

import type { ReviewResult } from "../../domain/review";
import { executeCiReview } from "../execution";

function result(decision: ReviewResult["decision"] = "PASS"): ReviewResult {
  return {
    decision,
    score: decision === "FAIL" ? 30 : 95,
    findings: [],
    stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    warnings: [{ code: "SOURCE_PARSE_FAILED", message: "One file was skipped." }],
    securityQualityGate: {
      decision: decision === "FAIL" ? "fail" : "pass",
      profileId: "security/strict",
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      summary: {
        total: 1, newFindings: 1, baseline: 0, suppressed: 0, blocking: 0, warnings: 0,
      },
      reasons: [],
    },
    durationMs: 12,
  };
}

describe("CI execution", () => {
  it("derives success and review failure from the completed domain result", async () => {
    const success = await executeCiReview({ analyze: vi.fn().mockResolvedValue({ result: result() }) });
    const failed = await executeCiReview({ analyze: vi.fn().mockResolvedValue({ result: result("FAIL") }) });

    expect(success).toMatchObject({ schemaVersion: 1, status: "success", exitCode: 0 });
    expect(failed).toMatchObject({ schemaVersion: 1, status: "review_failed", exitCode: 1 });
    if (failed.status === "review_failed") {
      expect(failed.review).toMatchObject({
        warnings: [{ code: "SOURCE_PARSE_FAILED" }],
        securityQualityGate: { profileId: "security/strict" },
      });
    }
  });

  it("distinguishes sanitized analysis failures", async () => {
    const execution = await executeCiReview({
      analyze: vi.fn().mockRejectedValue(new Error("token=super-secret")),
    });

    expect(execution).toEqual({
      schemaVersion: 1,
      status: "analysis_failed",
      exitCode: 2,
      error: { message: "Review analysis failed." },
    });
  });

  it("retains a completed review when publication fails", async () => {
    const execution = await executeCiReview({
      analyze: vi.fn().mockResolvedValue({ result: result("WARN") }),
      publish: vi.fn().mockRejectedValue(new Error("authorization token")),
      metadata: { provider: "github", repository: "acme/widget", revision: "abc123" },
    });

    expect(execution).toMatchObject({
      status: "publication_failed",
      exitCode: 2,
      review: { decision: "WARN", score: 95 },
      metadata: { provider: "github", repository: "acme/widget", revision: "abc123" },
      error: { message: "Review publication failed." },
    });
  });
});
