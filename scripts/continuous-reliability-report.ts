import { readFileSync } from "node:fs";
import { createDefaultReviewUseCases } from "../src/application/review";
import { buildContinuousReliabilityReport } from "../src/evaluation/continuous-report";
import { loadRealWorldEvaluationCorpus } from "../src/evaluation";
import { parseRepositoryReviewInput } from "../src/evaluation";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid offline snapshot bundle.");
  return Object.fromEntries(Object.entries(value));
}
const fixture = object(JSON.parse(readFileSync(new URL("../evaluation/fixtures/phase-7/monorepo-pr.json", import.meta.url), "utf8")));
function snapshot(files: unknown, snapshotId: string, head = false) {
  if (!Array.isArray(files)) throw new Error("Missing offline files.");
  return parseRepositoryReviewInput({ repositoryId: fixture.repositoryId, snapshotId, files,
    expectedPaths: files.map((file: unknown) => object(file).path), expectedFindings: [
      { id: "existing-console", ruleId: "quality.no-console", severity: "low", file: "packages/shared/src/debt.ts" },
      ...["package.json", "packages/shared/package.json", "packages/web/package.json"].map((file) => ({
        id: `existing-missing-lock:${file}`, ruleId: "security.supply-chain.lockfile-missing", severity: "medium", file,
      })),
      ...(head ? [
        { id: "unsafe-amount", ruleId: "security.no-eval", severity: "critical", file: "packages/shared/src/amount.ts" },
        { id: "dynamic-amount", ruleId: "security.execution.no-eval", severity: "critical", file: "packages/shared/src/amount.ts" },
        { id: "stale-effect", ruleId: "react.hooks.missing-deps", severity: "medium", file: "packages/web/src/Amount.tsx" },
      ] : []),
    ] });
}
const report = await buildContinuousReliabilityReport(createDefaultReviewUseCases(), {
  corpus: loadRealWorldEvaluationCorpus(),
  pullRequest: { id: "synthetic-monorepo-pr", title: "Amount parser and callback change",
    base: snapshot(fixture.base, "synthetic-base"), head: snapshot(fixture.head, "synthetic-head", true),
    expectedIntroducedFindings: [
      { id: "unsafe-amount", ruleId: "security.no-eval", severity: "critical", file: "packages/shared/src/amount.ts" },
      { id: "dynamic-amount", ruleId: "security.execution.no-eval", severity: "critical", file: "packages/shared/src/amount.ts" },
      { id: "stale-effect", ruleId: "react.hooks.missing-deps", severity: "medium", file: "packages/web/src/Amount.tsx" },
    ] },
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
