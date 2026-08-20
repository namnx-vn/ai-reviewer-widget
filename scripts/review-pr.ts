import { createAIProviderFromEnv } from "../src/ai/factory";
import { GitHubClient } from "../src/github/client";
import { filterFindingsForChangedLines } from "../src/github/comments";
import { getChangedLines } from "../src/github/diff";
import type { PullRequestFile } from "../src/github/pull-request";
import { reviewPullRequest } from "../src/review/reviewer";
import { createPullRequestSecurityGateConfig } from "../src/config/security-quality-gate";

const token = requiredEnvironment("GITHUB_TOKEN");
const [owner, repo] = parseRepository(requiredEnvironment("GITHUB_REPOSITORY"));
const pullRequestNumber = parsePullRequestNumber(requiredEnvironment("PR_NUMBER"));
const github = new GitHubClient(token);
const pullRequest = await github.getPullRequest(owner, repo, pullRequestNumber);

console.log(`Reviewing PR #${pullRequest.number}: ${pullRequest.title}`);

const reviewableFiles = pullRequest.files.filter(isReviewableFile);
const files = await Promise.all(reviewableFiles.map(async (file) => ({
  path: file.filename,
  content: await github.getFileContent(owner, repo, file.filename, pullRequest.headSha),
  patch: file.patch,
  changedLines: [...getChangedLines(file.patch)],
})));
const baseFiles = await Promise.all(
  reviewableFiles
    .filter((file) => file.status === "modified")
    .map(async (file) => ({
      path: file.filename,
      content: await github.getFileContent(owner, repo, file.filename, pullRequest.baseSha),
    })),
);

const result = await reviewPullRequest({
  title: pullRequest.title,
  description: pullRequest.body,
  files,
  baseFiles,
  securityQualityGate: createPullRequestSecurityGateConfig(
    process.env,
    new Date().toISOString(),
  ),
}, createAIProviderFromEnv(process.env));

const changedLinesByFile = new Map(
  reviewableFiles.map((file) => [file.filename, getChangedLines(file.patch)]),
);
const inlineFindings = filterFindingsForChangedLines(result.findings, changedLinesByFile);

await github.createCheckRun(owner, repo, pullRequest.headSha, result);
await github.createPullRequestReview(owner, repo, pullRequest.number, pullRequest.headSha, inlineFindings);

console.log(`Review completed: ${result.score}/100 (${inlineFindings.length} inline findings)`);

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

function isReviewableFile(file: PullRequestFile): boolean {
  return file.status !== "deleted" && /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file.filename);
}
