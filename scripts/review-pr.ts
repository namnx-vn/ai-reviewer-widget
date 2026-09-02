import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createAIProviderFromEnv } from "../src/ai/factory";
import { createDefaultReviewUseCases } from "../src/application/review";
import {
  executeCiReview,
  publishCiExecution,
} from "../src/ci";
import { loadReviewConfiguration } from "../src/cli/config-file";
import { GitHubClient } from "../src/github/client";
import {
  analyzeGitHubPullRequest,
  publishGitHubPullRequestReview,
  type GitHubPullRequestAnalysis,
} from "../src/github/review-pull-request";

interface GitHubCiAnalysis extends GitHubPullRequestAnalysis {
  readonly publisher: GitHubClient;
}

const execution = await executeCiReview<GitHubCiAnalysis>({
  analyze: async () => {
    const token = requiredEnvironment("GITHUB_TOKEN");
    const [owner, repo] = parseRepository(requiredEnvironment("GITHUB_REPOSITORY"));
    const pullRequestNumber = parsePullRequestNumber(requiredEnvironment("PR_NUMBER"));
    const configuration = loadReviewConfiguration(process.cwd());
    const aiReviewer = configuration.ai.mode === "disabled"
      ? undefined
      : createAIProviderFromEnv(process.env);
    const publisher = new GitHubClient(token);
    const analysis = await analyzeGitHubPullRequest(
      { owner, repo, pullRequestNumber },
      {
        client: publisher,
        review: createDefaultReviewUseCases({ configuration }),
        aiReviewer,
        environment: process.env,
        configuration,
        now: () => new Date().toISOString(),
      },
    );
    return { ...analysis, publisher };
  },
  publish: async (analysis) => {
    await publishGitHubPullRequestReview(analysis, analysis.publisher);
  },
  metadata: safeMetadata(process.env),
});

const publishedExecution = await publishCiExecution(execution, {
  writeArtifact: async (artifact) => {
    mkdirSync(dirname(artifact.path), { recursive: true });
    writeFileSync(artifact.path, artifact.content, "utf-8");
  },
  appendGitHubOutput: async (content) => {
    appendOptionalFile(process.env.GITHUB_OUTPUT, content);
  },
  appendStepSummary: async (content) => {
    appendOptionalFile(process.env.GITHUB_STEP_SUMMARY, content);
  },
});
console.log(`AI Reviewer status: ${publishedExecution.status}`);
process.exitCode = publishedExecution.exitCode;

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

function appendOptionalFile(path: string | undefined, content: string): void {
  if (path !== undefined && path.length > 0) appendFileSync(path, content, "utf-8");
}

function safeMetadata(environment: NodeJS.ProcessEnv): {
  readonly provider: "github";
  readonly repository?: string;
  readonly revision?: string;
} {
  const repository = environment.GITHUB_REPOSITORY;
  const revision = environment.HEAD_SHA;
  return {
    provider: "github",
    ...(repository !== undefined && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
      ? { repository }
      : {}),
    ...(revision !== undefined && /^[a-fA-F0-9]{7,64}$/.test(revision) ? { revision } : {}),
  };
}
