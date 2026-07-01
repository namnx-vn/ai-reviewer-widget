import { GitHubClient } from "../src/github/client";
import { reviewPullRequest } from "../src/review/reviewer";
import { formatReviewComment } from "../src/review/formatter";

// @ts-nocheck
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const pullRequestNumber = Number(process.env.PR_NUMBER);

if (!token || !repository || !pullRequestNumber) {
  throw new Error("Missing GitHub Action environment variables.");
}

const [owner, repo] = repository.split("/");
const github = new GitHubClient(token);

const pullRequest = await github.getPullRequest(owner, repo, pullRequestNumber);

console.log(`Reviewing PR #${pullRequest.number}: ${pullRequest.title}`);

const files = (
  await Promise.all(
    pullRequest.files
      .filter(
        (file) =>
          file.status !== "deleted" &&
          /\.(ts|tsx|js|jsx)$/.test(file.filename),
      )
      .map(async (file) => ({
        path: file.filename,
        content: await github.getFileContent(
          owner,
          repo,
          file.filename,
          pullRequest.headSha,
        ),
      })),
  )
).filter(Boolean);

const result = await reviewPullRequest({
  title: pullRequest.title,

  description: pullRequest.body,

  files,
});

const comment = formatReviewComment(result);

await github.createIssueComment(owner, repo, pullRequest.number, comment);

console.log(`Review completed: ${result.score}/100`);
