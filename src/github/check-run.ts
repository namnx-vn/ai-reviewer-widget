import { Octokit } from "@octokit/rest";

import type {
  ReviewResult,
} from "../review/types";

export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
  result: ReviewResult,
): Promise<void> {
  const conclusion =
    result.decision === "PASS"
      ? "success"
      : result.decision ===
          "WARN"
        ? "neutral"
        : "failure";

  await octokit.checks.create({
    owner,

    repo,

    name: "AI Reviewer",

    head_sha: sha,

    status: "completed",

    conclusion,

    output: {
      title:
        `AI Review · ${result.score}/100`,

      summary:
        buildSummary(result),
    },
  });
}

function buildSummary(
  result: ReviewResult,
): string {
  const warnings = getWarnings(result);
  const warningSummary = warnings.length === 0
    ? ""
    : `\n## Warnings\n\n${warnings.map((warning) => `- ${warning}`).join("\n")}\n`;

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
${warningSummary}`;
}

function getWarnings(result: ReviewResult): string[] {
  return result.warnings.map((warning) => `${warning.code}: ${warning.message}`);
}
