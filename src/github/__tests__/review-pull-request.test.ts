import { describe, expect, it, vi } from "vitest";

import type { ReviewResult } from "../../domain/review";
import { fingerprintReviewFinding } from "../../domain/review";
import type { AIReviewerPort, ReviewUseCases } from "../../application/review";
import { DEFAULT_RULE_CATALOG, resolveReviewConfiguration } from "../../config";
import {
  analyzeGitHubPullRequest,
  loadPullRequestReviewFiles,
  publishGitHubPullRequestReview,
  reviewGitHubPullRequest,
  type GitHubPullRequestClient,
} from "../review-pull-request";

function createClient(overrides: Partial<GitHubPullRequestClient> = {}): GitHubPullRequestClient {
  return {
    getPullRequest: vi.fn().mockResolvedValue({
      owner: "acme",
      repo: "widget",
      number: 17,
      title: "Tighten review",
      body: "PR body",
      baseSha: "base-sha",
      headSha: "head-sha",
      files: [
        {
          filename: "src/changed.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          changes: 2,
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
        {
          filename: "src/new.tsx",
          status: "added",
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: "@@ -0,0 +1 @@\n+export const New = () => null;",
        },
        {
          filename: "src/removed.ts",
          status: "deleted",
          additions: 0,
          deletions: 1,
          changes: 1,
        },
        {
          filename: "README.md",
          status: "modified",
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: "@@ -1 +1 @@\n+# Widget",
        },
      ],
    }),
    getFileContent: vi.fn(async (_owner, _repo, path, ref) => `${ref}:${path}`),
    createCheckRun: vi.fn().mockResolvedValue(undefined),
    createPullRequestReview: vi.fn().mockResolvedValue(undefined),
    listPublishedFindingComments: vi.fn().mockResolvedValue([]),
    updatePublishedFindingComment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createResult(): ReviewResult {
  return {
    findings: [
      {
        id: "finding-1",
        ruleId: "quality.test",
        title: "Changed line",
        message: "Review this line.",
        severity: "medium",
        source: "ast",
        confidence: 1,
        location: { file: "src/changed.ts", line: 1 },
      },
      {
        id: "finding-2",
        ruleId: "quality.test",
        title: "Unchanged line",
        message: "Do not publish this inline.",
        severity: "low",
        source: "ast",
        confidence: 1,
        location: { file: "src/changed.ts", line: 2 },
      },
    ],
    score: 90,
    decision: "WARN",
    stats: { critical: 0, high: 0, medium: 1, low: 1, info: 0 },
    durationMs: 5,
    warnings: [],
  };
}

describe("GitHub pull request review adapter", () => {
  it("converts only reviewable files and loads base content only for modified files", async () => {
    const client = createClient();
    const pullRequest = await client.getPullRequest("acme", "widget", 17);
    const converted = await loadPullRequestReviewFiles(client, pullRequest);

    expect(converted.files).toEqual([
      { path: "src/changed.ts", content: "head-sha:src/changed.ts", patch: "@@ -1 +1 @@\n-old\n+new", changedLines: [1] },
      { path: "src/new.tsx", content: "head-sha:src/new.tsx", patch: "@@ -0,0 +1 @@\n+export const New = () => null;", changedLines: [1] },
    ]);
    expect(converted.baseFiles).toEqual([{ path: "src/changed.ts", content: "base-sha:src/changed.ts" }]);
    expect(client.getFileContent).toHaveBeenCalledTimes(3);
  });

  it("applies repository path selection before loading pull request file content", async () => {
    const client = createClient();
    const pullRequest = await client.getPullRequest("acme", "widget", 17);
    const configuration = resolveReviewConfiguration({
      version: 1,
      include: ["src/**"],
      exclude: ["src/new.tsx"],
    }, DEFAULT_RULE_CATALOG);
    const converted = await loadPullRequestReviewFiles(client, pullRequest, configuration);

    expect(converted.files.map((file) => file.path)).toEqual(["src/changed.ts"]);
    expect(client.getFileContent).toHaveBeenCalledTimes(2);
  });

  it("fetches, reviews, filters inline findings, and publishes both GitHub outputs", async () => {
    const client = createClient();
    const result = createResult();
    const reviewPullRequest = vi.fn().mockResolvedValue(result);
    const review: Pick<ReviewUseCases, "reviewPullRequest"> = { reviewPullRequest };
    const aiReviewer: AIReviewerPort = { name: "test-ai", review: vi.fn().mockResolvedValue({ findings: [] }) };
    const onPullRequestLoaded = vi.fn();
    const configuration = resolveReviewConfiguration({
      version: 1,
      include: ["src/**"],
      qualityGate: { securityProfile: "security/strict" },
    }, DEFAULT_RULE_CATALOG);

    const output = await reviewGitHubPullRequest(
      { owner: "acme", repo: "widget", pullRequestNumber: 17 },
      {
        client,
        review,
        aiReviewer,
        environment: { SECURITY_GATE_PROFILE: "security/strict" },
        now: () => "2026-09-01T00:00:00.000Z",
        onPullRequestLoaded,
        configuration,
      },
    );

    expect(onPullRequestLoaded).toHaveBeenCalledWith(expect.objectContaining({ number: 17, title: "Tighten review" }));
    expect(reviewPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      title: "Tighten review",
      description: "PR body",
      securityQualityGate: expect.objectContaining({ profile: "security/strict", evaluatedAt: "2026-09-01T00:00:00.000Z" }),
      configuration,
    }), aiReviewer);
    expect(client.createCheckRun).toHaveBeenCalledWith("acme", "widget", "head-sha", result);
    expect(client.createPullRequestReview).toHaveBeenCalledWith("acme", "widget", 17, "head-sha", result.findings.slice(0, 1));
    expect(output).toEqual({ pullRequestNumber: 17, title: "Tighten review", result, inlineFindingCount: 1 });
  });

  it("does not duplicate an already-published finding on a repeated push", async () => {
    const result = createResult();
    const fingerprint = fingerprintReviewFinding(result.findings[0]);
    const client = createClient({
      listPublishedFindingComments: vi.fn().mockResolvedValue([{
        id: 41,
        body: `existing\n<!-- ai-reviewer:finding:${fingerprint} -->`,
      }]),
    });
    const analysis = await analyzeGitHubPullRequest(
      { owner: "acme", repo: "widget", pullRequestNumber: 17 },
      { client, review: { reviewPullRequest: vi.fn().mockResolvedValue(result) }, environment: {}, now: () => "2026-09-01T00:00:00.000Z" },
    );

    await publishGitHubPullRequestReview(analysis, client);

    expect(client.createPullRequestReview).toHaveBeenCalledWith("acme", "widget", 17, "head-sha", []);
    expect(client.updatePublishedFindingComment).not.toHaveBeenCalled();
  });

  it("marks stale published findings resolved", async () => {
    const client = createClient({
      listPublishedFindingComments: vi.fn().mockResolvedValue([{
        id: 51,
        body: "old finding\n<!-- ai-reviewer:finding:finding-v1-deadbeef -->",
      }]),
    });
    const result = createResult();
    const analysis = await analyzeGitHubPullRequest(
      { owner: "acme", repo: "widget", pullRequestNumber: 17 },
      { client, review: { reviewPullRequest: vi.fn().mockResolvedValue(result) }, environment: {}, now: () => "2026-09-01T00:00:00.000Z" },
    );

    await publishGitHubPullRequestReview(analysis, client);

    expect(client.updatePublishedFindingComment).toHaveBeenCalledWith(
      "acme", "widget", 51, expect.stringContaining("**Status:** Resolved"),
    );
  });

  it("keeps authoritative analysis unchanged when publication fails after bounded retries", async () => {
    const result = createResult();
    const client = createClient({ createCheckRun: vi.fn().mockRejectedValue(new Error("GitHub unavailable")) });
    const analysis = await analyzeGitHubPullRequest(
      { owner: "acme", repo: "widget", pullRequestNumber: 17 },
      { client, review: { reviewPullRequest: vi.fn().mockResolvedValue(result) }, environment: {}, now: () => "2026-09-01T00:00:00.000Z" },
    );

    await expect(publishGitHubPullRequestReview(analysis, client)).rejects.toThrow("GitHub unavailable");
    expect(client.createCheckRun).toHaveBeenCalledTimes(2);
    expect(analysis.result).toBe(result);
    expect(analysis.result.findings).toEqual(result.findings);
  });

  it("keeps analysis and publication as independently callable stages", async () => {
    const client = createClient();
    const result = createResult();
    const review = { reviewPullRequest: vi.fn().mockResolvedValue(result) };
    const dependencies = { client, review, environment: {}, now: () => "2026-09-01T00:00:00.000Z" };
    const analysis = await analyzeGitHubPullRequest(
      { owner: "acme", repo: "widget", pullRequestNumber: 17 }, dependencies,
    );

    expect(client.createCheckRun).not.toHaveBeenCalled();
    expect(client.createPullRequestReview).not.toHaveBeenCalled();
    const output = await publishGitHubPullRequestReview(analysis, client);

    expect(output.result).toBe(result);
    expect(client.createCheckRun).toHaveBeenCalledOnce();
    expect(client.createPullRequestReview).toHaveBeenCalledOnce();
  });
});
