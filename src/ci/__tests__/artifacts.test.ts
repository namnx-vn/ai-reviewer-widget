import { describe, expect, it } from "vitest";

import type { ReviewResult } from "../../domain/review";
import { createCiArtifacts } from "../artifacts";

describe("CI artifacts", () => {
  it("uses fixed safe paths and creates JSON, SARIF, and summary content", () => {
    const review: ReviewResult = {
      decision: "PASS", score: 100, findings: [],
      stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      warnings: [], durationMs: 1,
    };
    const artifacts = createCiArtifacts({
      schemaVersion: 1, status: "success", exitCode: 0, review,
    });

    expect(artifacts.map(({ path }) => path)).toEqual([
      "ai-reviewer-artifacts/review.json",
      "ai-reviewer-artifacts/review.sarif",
      "ai-reviewer-artifacts/summary.md",
    ]);
    expect(JSON.parse(artifacts[0].content)).toMatchObject({ schemaVersion: 1, status: "success" });
    expect(JSON.parse(artifacts[1].content)).toMatchObject({ version: "2.1.0" });
    expect(artifacts[2].content).toContain("Decision: PASS");
  });
});
