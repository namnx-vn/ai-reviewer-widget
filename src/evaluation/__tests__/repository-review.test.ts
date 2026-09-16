import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createDefaultReviewUseCases, type SourceFile, type AIReviewerPort } from "../../application/review";
import { evaluatePullRequestReview, evaluateRepositoryReview, parseRepositoryReviewInput, parsePullRequestReviewInput, type RepositorySnapshot } from "../repository-review";

const fixture: { repositoryId: string; base: SourceFile[]; head: SourceFile[] } = JSON.parse(
  readFileSync(new URL("../../../evaluation/fixtures/phase-7/monorepo-pr.json", import.meta.url), "utf8"),
);
const snapshot = (files: readonly SourceFile[], snapshotId = "head"): RepositorySnapshot => ({
  repositoryId: fixture.repositoryId, snapshotId, files,
  expectedPaths: files.map(({ path }) => path), expectedFindings: [],
});

describe("offline repository and PR pipeline evaluation", () => {
  it("runs full base/head and incremental application pipelines, preserving old debt", async () => {
    const report = await evaluatePullRequestReview(createDefaultReviewUseCases(), {
      id: "workspace-change", title: "Change amount parser", base: snapshot(fixture.base, "base"),
      head: snapshot(fixture.head), expectedIntroducedFindings: [
        { id: "unsafe-amount", ruleId: "security.no-eval", severity: "critical", file: "packages/shared/src/amount.ts" },
        { id: "stale-effect", ruleId: "react.hooks.missing-deps", severity: "high", file: "packages/web/src/Amount.tsx" },
      ],
    });
    expect(report.completeness.status).toBe("complete");
    expect(report.introduced.some(({ ruleId }) => ruleId === "security.no-eval")).toBe(true);
    expect(report.baseline.some(({ ruleId }) => ruleId === "quality.no-console")).toBe(true);
    expect(report.matchResult.falseNegatives).toHaveLength(0);
    expect(report.parity).toBe(true);
    expect(report.incrementalScope.impactedFiles).toContain("packages/web/src/Amount.tsx");
  });

  it("exposes semantic false negatives without adding a fixture-specific detector", async () => {
    const files = [{ path: "src/account.ts", content: "export function readAccount(actor: string, account: { owner: string; balance: number }) { return account.balance; }" }];
    const report = await evaluateRepositoryReview(createDefaultReviewUseCases(), {
      ...snapshot(files), expectedFindings: [{ id: "missing-owner-check", ruleId: "security.authorization.owner-check", severity: "high", file: "src/account.ts" }],
    });
    expect(report.status).toBe("failed");
    expect(report.matchResult.falseNegatives.map(({ id }) => id)).toEqual(["missing-owner-check"]);
  });

  it.each([
    { files: [], expectedPaths: ["src/a.ts"], code: "MISSING_FILE" },
    { files: [{ path: "src/a.ts", content: "import { x } from './missing'; export const a = x;" }], expectedPaths: ["src/a.ts"], code: "UNRESOLVED_LOCAL_IMPORT" },
    { files: [{ path: "src/a.ts", content: "export const =" }], expectedPaths: ["src/a.ts"], code: "SOURCE_PARSE_FAILED" },
    { files: [{ path: "src/a.py", content: "pass" }], expectedPaths: ["src/a.py"], code: "UNSUPPORTED_SOURCE" },
  ])("never presents $code as a complete clean review", async ({ files, expectedPaths, code }) => {
    const report = await evaluateRepositoryReview(createDefaultReviewUseCases(), { ...snapshot(files), expectedPaths });
    expect(report.status).toBe("incomplete");
    expect(report.completeness.issues.some((issue) => issue.code === code)).toBe(true);
  });

  it("enforces offline context budgets without reporting omitted files clean", async () => {
    const report = await evaluateRepositoryReview(createDefaultReviewUseCases(), {
      ...snapshot(fixture.head), contextBudget: { maxFiles: 1, maxCharacters: 200 },
    });
    expect(report.status).toBe("incomplete");
    expect(report.completeness.issues.some(({ code }) => code === "CONTEXT_BUDGET_EXCEEDED")).toBe(true);
  });

  it("passes complete repository content and PR base/head patches to the injected AI via the real engine", async () => {
    const review = vi.fn<AIReviewerPort["review"]>(async () => ({ findings: [] }));
    const ai = { name: "offline-ai", review };
    await evaluatePullRequestReview(createDefaultReviewUseCases(), {
      id: "ai-workspace", title: "Update parser", base: snapshot(fixture.base, "base"),
      head: snapshot(fixture.head), expectedIntroducedFindings: [],
    }, ai);
    expect(review).toHaveBeenCalledTimes(3);
    const inputs = review.mock.calls.map((call) => call[0]);
    expect(JSON.stringify(inputs)).toContain("packages/shared/src/amount.ts");
    expect(JSON.stringify(inputs)).toContain("eval(value)");
    expect(JSON.stringify(inputs)).toContain("Number(value)");
  });

  it("reports AI failures as incomplete despite deterministic fallback", async () => {
    const report = await evaluateRepositoryReview(createDefaultReviewUseCases(), snapshot(fixture.head), {
      name: "offline-ai", review: async () => { throw new Error("provider unavailable"); },
    });
    expect(report.status).toBe("incomplete");
    expect(report.result.findings.some(({ ruleId }) => ruleId === "security.no-eval")).toBe(true);
    expect(report.result.warnings.some(({ code }) => code === "AI_REVIEW_FAILED")).toBe(true);
  });
  it("keeps shifted-line debt baseline and exposes resolved vulnerabilities", async () => {
    const base = [{ path: "src/a.ts", content: "console.log('old');\neval('old');" }];
    const head = [{ path: "src/a.ts", content: "\nconsole.log('old');" }];
    const report = await evaluatePullRequestReview(createDefaultReviewUseCases(), {
      id: "remove-eval", title: "Remove execution", base: snapshot(base, "base"), head: snapshot(head), expectedIntroducedFindings: [],
    });
    expect(report.introduced).toHaveLength(0);
    expect(report.baseline.some(({ ruleId }) => ruleId === "quality.no-console")).toBe(true);
    expect(report.resolved.some(({ ruleId }) => ruleId === "security.no-eval")).toBe(true);
  });

  it("does not let a fake AI borrow unrelated React evidence for a SQL claim", async () => {
    const report = await evaluateRepositoryReview(createDefaultReviewUseCases(), snapshot(fixture.head), {
      name: "offline-ai", review: async () => ({ findings: [{
        title: "SQL injection", message: "Unescaped SQL query", severity: "critical", confidence: 0.99,
        file: "packages/web/src/Amount.tsx", line: 4,
      }] }),
    });
    expect(report.result.findings.some((finding) => finding.source === "ai" && finding.evidence?.status === "supported")).toBe(false);
  });

  it("strictly validates JSON operator input and rejects incomplete change manifests", async () => {
    const input = { id: "parse", title: "Parse", base: snapshot(fixture.base, "base"), head: snapshot(fixture.head), expectedIntroducedFindings: [] };
    expect(parsePullRequestReviewInput(input).id).toBe("parse");
    expect(parseRepositoryReviewInput(input.head).snapshotId).toBe("head");
    expect(() => parseRepositoryReviewInput({ ...input.head, typo: true })).toThrow("Unknown manifest field");
    expect(() => parseRepositoryReviewInput({ ...input.head, files: [{ path: "../escape.ts", content: "" }], expectedPaths: ["../escape.ts"] })).toThrow("normalized");
    expect(() => parseRepositoryReviewInput({ ...input.head, expectedFindings: [{ id: "x", ruleId: "x", severity: "urgent" }] })).toThrow("severity");
    expect(() => parsePullRequestReviewInput({ ...input, changes: [] })).toThrow("omit");
    await expect(evaluatePullRequestReview(createDefaultReviewUseCases(), { ...input, changes: [] })).rejects.toThrow("omit");
  });

  it("exposes worsened severity using base/head pipeline outputs", async () => {
    const actual = createDefaultReviewUseCases();
    const files = [{ path: "src/a.ts", content: "console.log('debt');" }];
    const useCases = { ...actual, reviewPullRequest: async (...args: Parameters<typeof actual.reviewPullRequest>) => {
      const result = await actual.reviewPullRequest(...args);
      return { ...result, findings: result.findings.map((finding) => ({ ...finding,
        severity: args[0].title.endsWith("(base)") ? "low" as const : "high" as const,
      })) };
    } };
    const report = await evaluatePullRequestReview(useCases, {
      id: "severity-change", title: "Change severity", base: snapshot(files, "base"), head: snapshot(files),
      expectedIntroducedFindings: [{ id: "worsened-debt", ruleId: "quality.no-console", severity: "high", file: "src/a.ts" }],
    });
    expect(report.worsened).toHaveLength(1);
    expect(report.worsened[0].before.severity).toBe("low");
    expect(report.worsened[0].after.severity).toBe("high");
  });

  it("exposes incremental omissions through parity rather than trusting changed-file coverage", async () => {
    const actual = createDefaultReviewUseCases();
    const useCases = { ...actual, reviewPullRequest: async (...args: Parameters<typeof actual.reviewPullRequest>) => {
      const result = await actual.reviewPullRequest(...args);
      return args[0].incrementalScope === undefined ? result : { ...result, findings: [] };
    } };
    const report = await evaluatePullRequestReview(useCases, {
      id: "scope-regression", title: "Change parser", base: snapshot(fixture.base, "base"), head: snapshot(fixture.head), expectedIntroducedFindings: [],
    });
    expect(report.parity).toBe(false);
    expect(report.status).toBe("failed");
    expect(report.missingIncrementalFindings.some(({ ruleId }) => ruleId === "security.no-eval")).toBe(true);
  });

});
