import { createAIProviderFromEnv } from "../src/ai/factory";
import { createDefaultReviewUseCases } from "../src/application/review";
import { GitHubClient } from "../src/github/client";
import { reviewGitHubPullRequest } from "../src/github/review-pull-request";

const token = requiredEnvironment("GITHUB_TOKEN");
const [owner, repo] = parseRepository(requiredEnvironment("GITHUB_REPOSITORY"));
const pullRequestNumber = parsePullRequestNumber(requiredEnvironment("PR_NUMBER"));
const github = new GitHubClient(token);
const output = await reviewGitHubPullRequest(
  { owner, repo, pullRequestNumber },
  {
    client: github,
    review: createDefaultReviewUseCases(),
    aiReviewer: createAIProviderFromEnv(process.env),
    environment: process.env,
    now: () => new Date().toISOString(),
    onPullRequestLoaded: (pullRequest) => {
      console.log(`Reviewing PR #${pullRequest.number}: ${pullRequest.title}`);
    },
  },
);

console.log(
  `Review completed: ${output.result.score}/100 (${output.inlineFindingCount} inline findings)`,
);

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseRepository(repository: string): [string, string] {
  const parts = repository.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("GITHUB_REPOSITORY must use the format owner/repo.");
  }
  return [parts[0], parts[1]];
}

function parsePullRequestNumber(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("PR_NUMBER must be a positive integer.");
  }
  return number;
}
