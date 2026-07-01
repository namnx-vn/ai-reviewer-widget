import { Octokit } from "@octokit/rest";

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
  ) {
    const { data: pullRequest } =
      await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

    return pullRequest;
  }

  async getFiles(
    owner: string,
    repo: string,
    pullNumber: number,
  ) {
    const { data } =
      await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

    return data;
  }

  async comment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ) {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }
}