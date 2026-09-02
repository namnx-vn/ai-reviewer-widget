import { describe, expect, it } from "vitest";

import { createGitHubOutput } from "../github-actions";

describe("GitHub Actions output", () => {
  it("writes only fixed single-line keys and sanitized enum values", () => {
    const output = createGitHubOutput({
      schemaVersion: 1,
      status: "analysis_failed",
      exitCode: 2,
      error: { message: "secret\nINJECTED=value" },
    });

    expect(output.split("\n").filter(Boolean)).toEqual([
      "status=analysis_failed",
      "exit_code=2",
      "decision=UNAVAILABLE",
      "json_path=ai-reviewer-artifacts/review.json",
      "sarif_path=ai-reviewer-artifacts/review.sarif",
      "summary_path=ai-reviewer-artifacts/summary.md",
    ]);
    expect(output).not.toContain("secret");
    expect(output).not.toContain("INJECTED");
  });
});
