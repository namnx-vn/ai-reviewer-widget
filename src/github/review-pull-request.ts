import type {
  AIReviewerPort,
  ReviewConfiguration,
  ReviewUseCases,
  SourceFile,
} from "../application/review";
import { isPathIncluded } from "../config";
import { createPullRequestSecurityGateConfig } from "../config/security-quality-gate";
import type { ReviewFinding, ReviewResult } from "../domain/review";
import { filterFindingsForChangedLines } from "./comments";
import { getChangedLines } from "./diff";
import {
  markPublishedCommentResolved,
  planFindingPublication,
  withPublicationRetry,
  type PublishedFindingComment,
} from "./publication-lifecycle";
import type { PullRequestContext, PullRequestFile } from "./pull-request";

const SOURCE_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export interface GitHubPullRequestClient {
  getPullRequest(owner: string, repo: string, pullRequestNumber: number): Promise<PullRequestContext>;
  getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string>;
  createCheckRun(owner: string, repo: string, sha: string, result: ReviewResult): Promise<void>;
  createPullRequestReview(
    owner: string,
    repo: string,
    pullRequestNumber: number,
    commitId: string,
    findings: readonly ReviewFinding[],
  ): Promise<void>;
  listPublishedFindingComments(
    owner: string,
    repo: string,
    pullRequestNumber: number,
  ): Promise<readonly PublishedFindingComment[]>;
  updatePublishedFindingComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
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
  readonly configuration?: ReviewConfiguration;
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

export interface GitHubPullRequestAnalysis extends GitHubPullRequestReviewOutput {
  readonly owner: string;
  readonly repo: string;
  readonly headSha: string;
  readonly inlineFindings: readonly ReviewFinding[];
}

export async function loadPullRequestReviewFiles(
  client: GitHubPullRequestClient,
  pullRequest: PullRequestContext,
  configuration?: ReviewConfiguration,
): Promise<PullRequestReviewFiles> {
  const reviewableFiles = pullRequest.files
    .filter(isReviewableFile)
    .filter((file) => configuration === undefined || isPathIncluded(file.filename, configuration));
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

export async function analyzeGitHubPullRequest(
  input: GitHubPullRequestReviewInput,
  dependencies: GitHubPullRequestReviewDependencies,
): Promise<GitHubPullRequestAnalysis> {
  const pullRequest = await dependencies.client.getPullRequest(
    input.owner,
    input.repo,
    input.pullRequestNumber,
  );
  dependencies.onPullRequestLoaded?.(pullRequest);
  const converted = await loadPullRequestReviewFiles(
    dependencies.client,
    pullRequest,
    dependencies.configuration,
  );
  const result = await dependencies.review.reviewPullRequest({
    title: pullRequest.title,
    description: pullRequest.body,
    files: converted.files,
    baseFiles: converted.baseFiles,
    securityQualityGate: createPullRequestSecurityGateConfig(
      dependencies.environment,
      dependencies.now(),
      dependencies.configuration?.qualityGate.securityProfile ?? "security/banking",
    ),
    configuration: dependencies.configuration,
  }, dependencies.aiReviewer);
  const changedLinesByFile = new Map(
    converted.files.map((file) => [file.path, new Set(file.changedLines)]),
  );
  const inlineFindings = filterFindingsForChangedLines(result.findings, changedLinesByFile);

  return {
    owner: input.owner,
    repo: input.repo,
    headSha: pullRequest.headSha,
    inlineFindings,
    pullRequestNumber: pullRequest.number,
    title: pullRequest.title,
    result,
    inlineFindingCount: inlineFindings.length,
  };
}

export async function publishGitHubPullRequestReview(
  analysis: GitHubPullRequestAnalysis,
  client: GitHubPullRequestClient,
): Promise<GitHubPullRequestReviewOutput> {
  const previousComments = await withPublicationRetry(() => client.listPublishedFindingComments(
    analysis.owner,
    analysis.repo,
    analysis.pullRequestNumber,
  ));
  const publication = planFindingPublication(analysis.inlineFindings, previousComments);

  await withPublicationRetry(() => client.createCheckRun(
    analysis.owner,
    analysis.repo,
    analysis.headSha,
    analysis.result,
  ));
  await withPublicationRetry(() => client.createPullRequestReview(
    analysis.owner,
    analysis.repo,
    analysis.pullRequestNumber,
    analysis.headSha,
    publication.create,
  ));
  for (const resolved of publication.resolve) {
    await withPublicationRetry(() => client.updatePublishedFindingComment(
      analysis.owner,
      analysis.repo,
      resolved.id,
      markPublishedCommentResolved(resolved.body),
    ));
  }

  return {
    pullRequestNumber: analysis.pullRequestNumber,
    title: analysis.title,
    result: analysis.result,
    inlineFindingCount: analysis.inlineFindingCount,
  };
}

export async function reviewGitHubPullRequest(
  input: GitHubPullRequestReviewInput,
  dependencies: GitHubPullRequestReviewDependencies,
): Promise<GitHubPullRequestReviewOutput> {
  const analysis = await analyzeGitHubPullRequest(input, dependencies);
  return publishGitHubPullRequestReview(analysis, dependencies.client);
}

function isReviewableFile(file: PullRequestFile): boolean {
  return file.status !== "deleted" && SOURCE_FILE_PATTERN.test(file.filename);
}
