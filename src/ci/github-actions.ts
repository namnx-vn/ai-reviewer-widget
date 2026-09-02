import type { CiExecutionResult } from "./contract";

export function createGitHubOutput(execution: CiExecutionResult): string {
  const decision = "review" in execution ? execution.review.decision : "UNAVAILABLE";
  return [
    `status=${execution.status}`,
    `exit_code=${execution.exitCode}`,
    `decision=${decision}`,
    "json_path=ai-reviewer-artifacts/review.json",
    "sarif_path=ai-reviewer-artifacts/review.sarif",
    "summary_path=ai-reviewer-artifacts/summary.md",
    "",
  ].join("\n");
}
