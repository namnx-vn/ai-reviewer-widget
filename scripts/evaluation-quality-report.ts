import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ASTRule } from "../src/analyzer/ast/rules";
import { createDefaultReviewUseCases } from "../src/application/review";
import { runEvaluationSuite } from "../src/evaluation/runner";
import { serializeEvaluationReport } from "../src/evaluation/report";

const fixturePath = "evaluation/fixtures/smoke/basic.ts";
const source = readFileSync(resolve(process.cwd(), fixturePath), "utf8");

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

const report = runEvaluationSuite(
  createDefaultReviewUseCases({ astRules: [smokeRule] }),
  [{
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
  }],
  { repetitions: 2 },
);

process.stdout.write(`${serializeEvaluationReport(report)}\n`);
