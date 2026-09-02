import type { CiExecutionResult } from "./contract";
import { createSarifDocument } from "./sarif";

export interface CiArtifact {
  readonly path: string;
  readonly content: string;
}

export function createCiArtifacts(execution: CiExecutionResult): readonly CiArtifact[] {
  const review = "review" in execution ? execution.review : undefined;
  return [
    {
      path: "ai-reviewer-artifacts/review.json",
      content: `${JSON.stringify(execution, null, 2)}\n`,
    },
    {
      path: "ai-reviewer-artifacts/review.sarif",
      content: `${JSON.stringify(createSarifDocument(review), null, 2)}\n`,
    },
    {
      path: "ai-reviewer-artifacts/summary.md",
      content: formatCiSummary(execution),
    },
  ];
}

export function formatCiSummary(execution: CiExecutionResult): string {
  const lines = [
    "## AI Reviewer",
    "",
    `Status: ${execution.status}`,
    `Exit code: ${execution.exitCode}`,
  ];
  if ("review" in execution) {
    lines.push(
      `Decision: ${execution.review.decision}`,
      `Score: ${execution.review.score}/100`,
      `Findings: ${execution.review.findings.length}`,
      `Warnings: ${execution.review.warnings.length}`,
    );
  }
  if ("error" in execution) lines.push(`Error: ${execution.error.message}`);
  return `${lines.join("\n")}\n`;
}
