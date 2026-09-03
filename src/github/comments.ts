import { Octokit } from "@octokit/rest";

import type { ReviewFinding } from "../domain/review";
import { findingPublicationMarker } from "./publication-lifecycle";

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

export function filterFindingsForChangedLines(
  findings: readonly ReviewFinding[],
  changedLinesByFile: ReadonlyMap<string, ReadonlySet<number>>,
): ReviewFinding[] {
  return findings.filter((finding) => {
    const location = finding.location;
    return Boolean(
      location?.file &&
        location.line !== undefined &&
        changedLinesByFile.get(location.file)?.has(location.line),
    );
  });
}

export function findingToComment(
  finding: ReviewFinding,
): InlineComment | null {
  if (!finding.location?.file || !finding.location.line) return null;

  return {
    path: finding.location.file,
    line: finding.location.line,
    body: [
      `### ${severityEmoji(finding.severity)} ${finding.title}`,
      "",
      finding.message,
      finding.suggestion ? `\n**Suggestion:** ${finding.suggestion}` : "",
      "",
      `_Source: ${finding.source} · Rule: ${finding.ruleId}_`,
      "",
      findingPublicationMarker(finding),
    ].join("\n"),
  };
}

function severityEmoji(severity: ReviewFinding["severity"]): string {
  switch (severity) {
    case "critical": return "🚨";
    case "high": return "🔴";
    case "medium": return "🟡";
    case "low": return "🔵";
    default: return "ℹ️";
  }
}

export async function createPullRequestReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitId: string,
  findings: readonly ReviewFinding[],
): Promise<void> {
  const comments = findings.map(findingToComment).filter(
    (comment): comment is InlineComment => comment !== null,
  );
  if (comments.length === 0) return;

  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    commit_id: commitId,
    event: "COMMENT",
    comments: comments.map((comment) => ({
      path: comment.path,
      line: comment.line,
      side: "RIGHT",
      body: comment.body,
    })),
  });
}
