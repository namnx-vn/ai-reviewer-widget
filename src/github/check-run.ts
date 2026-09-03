import { Octokit } from "@octokit/rest";

import type { ReviewFinding, ReviewResult } from "../domain/review";

export const GITHUB_CHECK_ANNOTATION_LIMIT = 50;

export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
  result: ReviewResult,
): Promise<void> {
  const conclusion = result.decision === "PASS"
    ? "success"
    : result.decision === "WARN"
      ? "neutral"
      : "failure";
  const annotationCandidates = result.findings.filter(hasAnnotationLocation);
  const annotations = annotationCandidates
    .slice(0, GITHUB_CHECK_ANNOTATION_LIMIT)
    .map(toAnnotation);

  await octokit.checks.create({
    owner,
    repo,
    name: "AI Reviewer",
    head_sha: sha,
    status: "completed",
    conclusion,
    output: {
      title: `AI Review · ${result.score}/100`,
      summary: buildSummary(result, annotationCandidates.length - annotations.length),
      annotations,
    },
  });
}

function buildSummary(result: ReviewResult, omittedAnnotations: number): string {
  const warnings = getWarnings(result);
  const securityGate = result.securityQualityGate;
  const securityGateSummary = securityGate === undefined
    ? ""
    : [
        "\n## Security quality gate",
        "",
        `**Profile:** ${securityGate.profileId}`,
        `**Decision:** ${securityGate.decision.toUpperCase()}`,
        `**New:** ${securityGate.summary.newFindings} · **Baseline:** ${securityGate.summary.baseline} · **Suppressed:** ${securityGate.summary.suppressed} · **Blocking:** ${securityGate.summary.blocking}`,
        "",
      ].join("\n");
  const warningSummary = warnings.length === 0
    ? ""
    : `\n## Warnings\n\n${warnings.map((warning) => `- ${warning}`).join("\n")}\n`;
  const annotationSummary = omittedAnnotations === 0
    ? ""
    : `\n**Annotations omitted by GitHub limit:** ${omittedAnnotations}\n`;

  return `
## 🤖 AI Reviewer

**Decision:** ${result.decision}

**Score:** ${result.score}/100

| Severity | Count |
|---|---:|
| 🚨 Critical | ${result.stats.critical} |
| 🔴 High | ${result.stats.high} |
| 🟡 Medium | ${result.stats.medium} |
| 🔵 Low | ${result.stats.low} |
| ℹ️ Info | ${result.stats.info} |

**Findings:** ${result.findings.length}

**Duration:** ${Math.round(result.durationMs)}ms
${annotationSummary}${securityGateSummary}${warningSummary}`;
}

function hasAnnotationLocation(
  finding: ReviewFinding,
): finding is ReviewFinding & { readonly location: { readonly file: string; readonly line: number; readonly column?: number } } {
  return finding.location?.file !== undefined && finding.location.line !== undefined;
}

function toAnnotation(finding: ReviewFinding & { readonly location: { readonly file: string; readonly line: number } }) {
  return {
    path: finding.location.file,
    start_line: finding.location.line,
    end_line: finding.location.line,
    annotation_level: annotationLevel(finding.severity),
    title: finding.title.slice(0, 255),
    message: finding.message,
  } as const;
}

function annotationLevel(severity: ReviewFinding["severity"]): "notice" | "warning" | "failure" {
  if (severity === "critical" || severity === "high") return "failure";
  if (severity === "medium") return "warning";
  return "notice";
}

function getWarnings(result: ReviewResult): string[] {
  return result.warnings.map((warning) => `${warning.code}: ${warning.message}`);
}
