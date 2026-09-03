import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ASTRule } from "../../analyzer/ast/rules";
import { createDefaultReviewUseCases } from "../../application/review";
import { runEvaluationSuite } from "../runner";

const smokeRule: ASTRule = {
  id: "evaluation/smoke",
  description: "Produces one deterministic smoke finding for the program node.",
  check(node, file) {
    if (typeof node !== "object" || node === null || !("type" in node) || node.type !== "Program") {
      return [];
    }

    return [{
      id: "evaluation-smoke",
      ruleId: "evaluation/smoke",
      title: "Evaluation smoke finding",
      message: "Smoke corpus reached the production deterministic review pipeline.",
      severity: "info",
      source: "ast",
      confidence: 1,
      location: { file, line: 1 },
    }];
  },
};

describe("evaluation runner", () => {
  it("evaluates a smoke corpus through the production review use cases", () => {
    const fixturePath = "evaluation/fixtures/smoke/basic.ts";
    const source = readFileSync(resolve(process.cwd(), fixturePath), "utf8");
    const reviewUseCases = createDefaultReviewUseCases({ astRules: [smokeRule] });
    let now = 0;

    const report = runEvaluationSuite(reviewUseCases, [{
      version: 1,
      id: "smoke-basic",
      title: "Basic TypeScript smoke case",
      category: "typescript-library",
      files: [{ path: fixturePath, content: source }],
      expectedFindings: [{
        id: "evaluation-smoke",
        ruleId: "evaluation/smoke",
        severity: "info",
        file: fixturePath,
        line: 1,
      }],
    }], {
      repetitions: 2,
      now: () => {
        now += 5;
        return now;
      },
      generatedAt: () => "2026-09-03T00:00:00.000Z",
    });

    expect(report.summary.precision).toBe(1);
    expect(report.summary.recall).toBe(1);
    expect(report.summary.stability).toBe(1);
    expect(report.summary.falsePositiveCount).toBe(0);
    expect(report.summary.falseNegativeCount).toBe(0);
    expect(report.summary.runtimeMs).toBe(5);
  });
});
