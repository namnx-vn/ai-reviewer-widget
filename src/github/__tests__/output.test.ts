import { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";

import { createCheckRun } from "../check-run";
import {
  createPullRequestReview,
  findingToComment,
} from "../comments";
import type { ReviewFinding, ReviewResult } from "../../review/types";

const finding: ReviewFinding = {
  id: "ast-1",
  ruleId: "security.no-eval",
  title: "Avoid eval",
  message: "eval executes code.",
  severity: "high",
  source: "ast",
  confidence: 1,
  location: { file: "src/App.ts", line: 12 },
  suggestion: "Use a safe parser.",
};

const result: ReviewResult = {
  score: 80,
  decision: "WARN",
  findings: [finding],
  stats: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
  warnings: [{ code: "AI_REVIEW_FAILED", message: "AI review was unavailable." }],
  durationMs: 12.6,
};

describe("GitHub review output", () => {
  it("formats a finding as a GitHub inline comment", () => {
    expect(findingToComment(finding)).toEqual({
      path: "src/App.ts",
      line: 12,
      body: expect.stringContaining("### 🔴 Avoid eval"),
    });
    expect(findingToComment({ ...finding, location: undefined })).toBeNull();
  });

  it("creates a check run with decision, stats, and warnings", async () => {
    const octokit = new Octokit({ auth: "test" });
    const create = vi.spyOn(octokit.checks, "create").mockResolvedValue({} as never);

    await createCheckRun(octokit, "owner", "repo", "head-sha", result);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      owner: "owner",
      repo: "repo",
      head_sha: "head-sha",
      conclusion: "neutral",
      output: expect.objectContaining({
        summary: expect.stringContaining("AI_REVIEW_FAILED: AI review was unavailable."),
      }),
    }));
  });

  it("includes an auditable security gate summary", async () => {
    const octokit = new Octokit({ auth: "test" });
    const create = vi.spyOn(octokit.checks, "create").mockResolvedValue({} as never);

    await createCheckRun(octokit, "owner", "repo", "head-sha", {
      ...result,
      decision: "FAIL",
      securityQualityGate: {
        decision: "fail",
        profileId: "security/banking",
        evaluatedAt: "2026-08-31T10:00:00.000Z",
        summary: {
          total: 2,
          newFindings: 1,
          baseline: 1,
          suppressed: 0,
          blocking: 1,
          warnings: 0,
        },
        reasons: [],
      },
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      conclusion: "failure",
      output: expect.objectContaining({
        summary: expect.stringContaining("**Profile:** security/banking"),
      }),
    }));
  });

  it("does not make a review API call with no commentable findings", async () => {
    const octokit = new Octokit({ auth: "test" });
    const createReview = vi.spyOn(octokit.pulls, "createReview").mockResolvedValue({} as never);

    await createPullRequestReview(octokit, "owner", "repo", 4, "head-sha", [
      { ...finding, location: undefined },
    ]);

    expect(createReview).not.toHaveBeenCalled();
  });

  it("posts only valid inline comments using the PR head commit", async () => {
    const octokit = new Octokit({ auth: "test" });
    const createReview = vi.spyOn(octokit.pulls, "createReview").mockResolvedValue({} as never);

    await createPullRequestReview(octokit, "owner", "repo", 4, "head-sha", [finding]);

    expect(createReview).toHaveBeenCalledWith(expect.objectContaining({
      pull_number: 4,
      commit_id: "head-sha",
      event: "COMMENT",
      comments: [expect.objectContaining({ path: "src/App.ts", line: 12, side: "RIGHT" })],
    }));
  });
});
