import { Octokit } from "@octokit/rest";

import type { PullRequestContext, PullRequestFile } from "./pull-request";

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

      status: file.status as PullRequestFile["status"],

      additions: file.additions,

      deletions: file.deletions,

      changes: file.changes,

      patch: file.patch,
    }));
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

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }
}
