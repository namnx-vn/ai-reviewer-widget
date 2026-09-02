import { describe, expect, it, vi } from "vitest";

import type { ReviewResult } from "../../domain/review";
import type { CiExecutionResult } from "../contract";
import { publishCiExecution } from "../publication";

function success(): CiExecutionResult {
  const review: ReviewResult = {
    decision: "PASS", score: 100, findings: [],
    stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    warnings: [], durationMs: 1,
  };
  return { schemaVersion: 1, status: "success", exitCode: 0, review };
}

describe("CI publication adapter", () => {
  it.each([
    ["artifact", { writeArtifact: vi.fn().mockRejectedValue(new Error("token=artifact-secret")) }],
    ["GitHub output", { appendGitHubOutput: vi.fn().mockRejectedValue(new Error("token=output-secret")) }],
    ["step summary", { appendStepSummary: vi.fn().mockRejectedValue(new Error("token=summary-secret")) }],
  ])("classifies a %s writer failure without leaking its error", async (_name, override) => {
    const execution = await publishCiExecution(success(), {
      writeArtifact: vi.fn().mockResolvedValue(undefined),
      appendGitHubOutput: vi.fn().mockResolvedValue(undefined),
      appendStepSummary: vi.fn().mockResolvedValue(undefined),
      ...override,
    });

    expect(execution).toMatchObject({
      status: "publication_failed",
      exitCode: 2,
      review: { decision: "PASS", score: 100 },
      error: { message: "Review publication failed." },
    });
    expect(JSON.stringify(execution)).not.toContain("secret");
  });

  it("preserves the primary analysis failure when a writer also fails", async () => {
    const analysisFailure: CiExecutionResult = {
      schemaVersion: 1,
      status: "analysis_failed",
      exitCode: 2,
      error: { message: "Review analysis failed." },
    };

    const execution = await publishCiExecution(analysisFailure, {
      writeArtifact: vi.fn().mockRejectedValue(new Error("writer secret")),
      appendGitHubOutput: vi.fn().mockRejectedValue(new Error("writer secret")),
      appendStepSummary: vi.fn().mockRejectedValue(new Error("writer secret")),
    });

    expect(execution).toEqual(analysisFailure);
  });
});
