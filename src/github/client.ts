import { Octokit } from "@octokit/rest";

import { createCheckRun } from "./check-run";
import { createPullRequestReview } from "./comments";
import type { PullRequestContext, PullRequestFile } from "./pull-request";
import type { ReviewFinding, ReviewResult } from "../review/types";

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequestContext> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const files = await this.getFiles(owner, repo, pullNumber);

    return {
      owner,
      repo,
      number: pullNumber,

      title: pr.title,

      body: pr.body ?? undefined,

      baseSha: pr.base.sha,

      headSha: pr.head.sha,

      files,
    };
  }

  async getFiles(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequestFile[]> {
    const response = await this.octokit.paginate(this.octokit.pulls.listFiles, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    return response.map((file) => ({
      filename: file.filename,

      status: toPullRequestFileStatus(file.status),

      additions: file.additions,

      deletions: file.deletions,

      changes: file.changes,

      patch: file.patch,
    }));
  }

  async createCheckRun(owner: string, repo: string, sha: string, result: ReviewResult): Promise<void> {
    await createCheckRun(this.octokit, owner, repo, sha, result);
  }

  async createPullRequestReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    findings: readonly ReviewFinding[],
  ): Promise<void> {
    await createPullRequestReview(this.octokit, owner, repo, pullNumber, commitId, findings);
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(data) || data.type !== "file") {
      throw new Error(`Unable to read file: ${path}`);
    }

    if (!data.content) {
      return "";
    }

    return Buffer.from(data.content, "base64").toString("utf8");
  }

}

function toPullRequestFileStatus(status: string): PullRequestFile["status"] {
  if (status === "added" || status === "modified" || status === "deleted" || status === "renamed") {
    return status;
  }
  throw new Error(`Unsupported pull request file status: ${status}`);
}
