import type {
  AIReviewerPort,
  ReviewUseCases,
  SourceFile,
} from "../application/review";
import { createPullRequestSecurityGateConfig } from "../config/security-quality-gate";
import type { ReviewFinding, ReviewResult } from "../domain/review";
import { filterFindingsForChangedLines } from "./comments";
import { getChangedLines } from "./diff";
import type { PullRequestContext, PullRequestFile } from "./pull-request";

const SOURCE_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export interface GitHubPullRequestClient {
  getPullRequest(
    owner: string,
    repo: string,
    pullRequestNumber: number,
  ): Promise<PullRequestContext>;
  getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string>;
  createCheckRun(owner: string, repo: string, sha: string, result: ReviewResult): Promise<void>;
  createPullRequestReview(
    owner: string,
    repo: string,
    pullRequestNumber: number,
    commitId: string,
    findings: readonly ReviewFinding[],
  ): Promise<void>;
}

export interface GitHubPullRequestReviewInput {
  readonly owner: string;
  readonly repo: string;
  readonly pullRequestNumber: number;
}

export interface GitHubPullRequestReviewDependencies {
  readonly client: GitHubPullRequestClient;
  readonly review: Pick<ReviewUseCases, "reviewPullRequest">;
  readonly aiReviewer?: AIReviewerPort;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: () => string;
  readonly onPullRequestLoaded?: (pullRequest: PullRequestContext) => void;
}

export interface PullRequestReviewFiles {
  readonly files: readonly SourceFile[];
  readonly baseFiles: readonly SourceFile[];
}

export interface GitHubPullRequestReviewOutput {
  readonly pullRequestNumber: number;
  readonly title: string;
  readonly result: ReviewResult;
  readonly inlineFindingCount: number;
}

export async function loadPullRequestReviewFiles(
  client: GitHubPullRequestClient,
  pullRequest: PullRequestContext,
): Promise<PullRequestReviewFiles> {
  const reviewableFiles = pullRequest.files.filter(isReviewableFile);
  const files = await Promise.all(
    reviewableFiles.map(async (file): Promise<SourceFile> => ({
      path: file.filename,
      content: await client.getFileContent(
        pullRequest.owner,
        pullRequest.repo,
        file.filename,
        pullRequest.headSha,
      ),
      patch: file.patch,
      changedLines: [...getChangedLines(file.patch)],
    })),
  );
  const baseFiles = await Promise.all(
    reviewableFiles
      .filter((file) => file.status === "modified")
      .map(async (file): Promise<SourceFile> => ({
        path: file.filename,
        content: await client.getFileContent(
          pullRequest.owner,
          pullRequest.repo,
          file.filename,
          pullRequest.baseSha,
        ),
      })),
  );

  return { files, baseFiles };
}

export async function reviewGitHubPullRequest(
  input: GitHubPullRequestReviewInput,
  dependencies: GitHubPullRequestReviewDependencies,
): Promise<GitHubPullRequestReviewOutput> {
  const pullRequest = await dependencies.client.getPullRequest(
    input.owner,
    input.repo,
    input.pullRequestNumber,
  );
  dependencies.onPullRequestLoaded?.(pullRequest);
  const converted = await loadPullRequestReviewFiles(dependencies.client, pullRequest);
  const result = await dependencies.review.reviewPullRequest({
    title: pullRequest.title,
    description: pullRequest.body,
    files: converted.files,
    baseFiles: converted.baseFiles,
    securityQualityGate: createPullRequestSecurityGateConfig(
      dependencies.environment,
      dependencies.now(),
    ),
  }, dependencies.aiReviewer);
  const changedLinesByFile = new Map(
    converted.files.map((file) => [file.path, new Set(file.changedLines)]),
  );
  const inlineFindings = filterFindingsForChangedLines(result.findings, changedLinesByFile);

  await dependencies.client.createCheckRun(
    input.owner,
    input.repo,
    pullRequest.headSha,
    result,
  );
  await dependencies.client.createPullRequestReview(
    input.owner,
    input.repo,
    pullRequest.number,
    pullRequest.headSha,
    inlineFindings,
  );

  return {
    pullRequestNumber: pullRequest.number,
    title: pullRequest.title,
    result,
    inlineFindingCount: inlineFindings.length,
  };
}

function isReviewableFile(file: PullRequestFile): boolean {
  return file.status !== "deleted" && SOURCE_FILE_PATTERN.test(file.filename);
}
