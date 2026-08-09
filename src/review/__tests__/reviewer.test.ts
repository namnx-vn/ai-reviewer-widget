import { describe, expect, it, vi } from "vitest";

import type { AIProvider } from "../../ai/types";
import {
  convertAIFindings,
  reviewFiles,
  reviewPullRequest,
} from "../reviewer";

describe("reviewer orchestration", () => {
  it("converts AI response findings into review-domain findings", () => {
    expect(convertAIFindings({
      findings: [{
        title: "Risky code",
        message: "This should be changed.",
        severity: "medium",
        confidence: 0.8,
        suggestion: "Use a safer alternative.",
      }],
    })).toEqual([expect.objectContaining({
      id: "ai-1",
      source: "ai",
      ruleId: "ai.semantic-review",
    })]);
  });

  it("reviews deterministic files without requiring an AI provider", () => {
    const result = reviewFiles([
      { path: "src/example.ts", content: "eval('input');" },
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.no-eval", source: "ast" }),
    ]));
    expect(result.warnings).toEqual([]);
  });

  it("includes React intelligence in synchronous deterministic reviews", () => {
    const result = reviewFiles([
      {
        path: "src/components/Counter.tsx",
        content: `
          import { useState } from "react";

          export function Counter({ enabled }: { enabled: boolean }) {
            if (enabled) {
              const [count] = useState(0);
              return <span>{count}</span>;
            }

            return <span>Disabled</span>;
          }
        `,
      },
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "react.hooks.conditional",
        source: "ast",
        confidence: 1,
      }),
    ]));
  });

  it("integrates optional Next.js intelligence for App Router files", async () => {
    const result = await reviewPullRequest({
      title: "Add interactive page",
      files: [{
        path: "app/dashboard/page.tsx",
        content: `
          import { useState } from "react";

          export default function Page() {
            const [open] = useState(false);
            return <button onClick={() => undefined}>{String(open)}</button>;
          }
        `,
      }],
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "nextjs.app-router.client-hook-in-server-component",
        source: "ast",
        confidence: 1,
      }),
      expect.objectContaining({
        ruleId: "nextjs.app-router.event-handler-in-server-component",
        source: "ast",
        confidence: 1,
      }),
    ]));
    expect(result.warnings).toEqual([]);
  });

  it("does not treat a generic app directory as a Next.js App Router", async () => {
    const result = await reviewPullRequest({
      title: "Add application component",
      files: [{
        path: "src/app/App.tsx",
        content: `
          import { useState } from "react";

          export function App() {
            const [open] = useState(false);
            return <button onClick={() => undefined}>{String(open)}</button>;
          }
        `,
      }],
    });

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain(
      "nextjs.app-router.client-hook-in-server-component",
    );
    expect(result.findings.map((finding) => finding.ruleId)).not.toContain(
      "nextjs.app-router.event-handler-in-server-component",
    );
  });

  it("keeps valid findings when another source file cannot be parsed", () => {
    const result = reviewFiles([
      { path: "src/valid.ts", content: "eval('input');" },
      {
        path: "src/Broken.tsx",
        content: "export function Broken() { return <div>; }",
      },
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.no-eval" }),
    ]));
    expect(result.warnings).toEqual([{
      code: "SOURCE_PARSE_FAILED",
      message: "Skipped deterministic analysis for src/Broken.tsx because it could not be parsed.",
    }]);
  });

  it("includes Micro Frontend architecture findings in deterministic reviews", () => {
    const result = reviewFiles([{
      path: "apps/host/shell/App.tsx",
      content: 'import ProductRow from "@remote/catalog/internal/ProductRow";',
    }]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "mfe.remote-deep-import",
        source: "architecture",
        confidence: 1,
      }),
    ]));
  });

  it("continues the AI review when deterministic analysis skips malformed source", async () => {
    const review = vi.fn(async () => ({ findings: [] }));
    const provider: AIProvider = { name: "test", review };

    const result = await reviewPullRequest({
      title: "Partially valid pull request",
      files: [
        {
          path: "src/valid.ts",
          content: "eval('input');",
          patch: "+eval('input');",
        },
        {
          path: "src/Broken.tsx",
          content: "export function Broken() { return <div>; }",
          patch: "+export function Broken() { return <div>; }",
        },
      ],
    }, provider);

    expect(review).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([{
      code: "SOURCE_PARSE_FAILED",
      message: "Skipped deterministic analysis for src/Broken.tsx because it could not be parsed.",
    }]);
  });

  it("sends the pull request patch to AI without exposing unchanged file content", async () => {
    const review = vi.fn(async () => ({ findings: [] }));
    const provider: AIProvider = { name: "test", review };

    await reviewPullRequest({
      title: "Limit AI review data",
      files: [{
        path: "src/payment.ts",
        content: [
          'const internalBankToken = "unchanged-sensitive-value";',
          "export const amount = 250;",
        ].join("\n"),
        patch: [
          "@@ -2,1 +2,1 @@",
          "-export const amount = 100;",
          "+export const amount = 250;",
        ].join("\n"),
      }],
    }, provider);

    expect(review).toHaveBeenCalledWith(expect.objectContaining({
      diff: expect.stringContaining("+export const amount = 250;"),
    }));

    const aiInput = review.mock.calls[0]?.[0];
    expect(aiInput?.diff).toContain("FILE: src/payment.ts");
    expect(aiInput?.diff).not.toContain("unchanged-sensitive-value");
  });

  it("fails closed for AI input when no changed-line patch is available", async () => {
    const review = vi.fn(async () => ({ findings: [] }));
    const provider: AIProvider = { name: "test", review };

    const result = await reviewPullRequest({
      title: "No patch available",
      files: [{ path: "src/payment.ts", content: "export const amount = 250;" }],
    }, provider);

    expect(review).not.toHaveBeenCalled();
    expect(result.warnings).toContainEqual({
      code: "AI_INPUT_OMITTED",
      message: "AI review was skipped because no changed-line patch was available.",
    });
  });

  it("audits AI input redaction and truncation before provider execution", async () => {
    const review = vi.fn(async () => ({ findings: [] }));
    const provider: AIProvider = { name: "test", review };
    const credentialKey = ["api", "Key"].join("");
    const sensitiveValue = ["bank", "credential", "fixture"].join("-");

    const result = await reviewPullRequest({
      title: "Large sensitive patch",
      files: [{
        path: "src/payment.ts",
        content: "export const amount = 250;",
        patch: [
          `+const ${credentialKey} = "${sensitiveValue}";`,
          `+const payload = "${"x".repeat(40_000)}";`,
        ].join("\n"),
      }],
    }, provider);

    const aiInput = review.mock.calls[0]?.[0];
    expect(aiInput?.diff).not.toContain(sensitiveValue);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AI_INPUT_REDACTED" }),
      expect.objectContaining({ code: "AI_INPUT_TRUNCATED" }),
    ]));
  });

  it("passes deterministic and AI findings through the unified review engine", async () => {
    const provider: AIProvider = {
      name: "test",
      review: async () => ({
        findings: [{
          title: "Potential concern",
          message: "Consider simplifying this.",
          severity: "high",
          confidence: 0.7,
        }],
      }),
    };

    const result = await reviewPullRequest({
      title: "Review me",
      description: "Example PR",
      files: [{
        path: "src/example.ts",
        content: "eval('input');",
        patch: "+eval('input');",
      }],
    }, provider);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.no-eval", confidence: 1 }),
      expect.objectContaining({ title: "Potential concern", severity: "medium", source: "ai" }),
    ]));
    expect(result.warnings).toEqual([]);
  });

  it("applies the banking security gate to pull request findings", async () => {
    const result = await reviewPullRequest({
      title: "Add unsafe account lookup",
      files: [{
        path: "src/account-handler.ts",
        content: 'db.query("SELECT * FROM accounts WHERE id = " + req.query.id);',
      }],
      securityQualityGate: {
        profile: "security/banking",
        evaluatedAt: "2026-08-31T10:00:00.000Z",
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.injection.sql" }),
    ]));
    expect(result.securityQualityGate).toEqual(expect.objectContaining({
      profileId: "security/banking",
      decision: "fail",
    }));
    expect(result.decision).toBe("FAIL");
  });

  it("keeps baselined critical security debt visible without blocking adoption", async () => {
    const input = {
      title: "Adopt banking gate",
      files: [{
        path: "src/account-handler.ts",
        content: 'db.query("SELECT * FROM accounts WHERE id = " + req.query.id);',
      }],
    };
    const discovery = await reviewPullRequest(input);
    const findingId = discovery.findings.find(
      (finding) => finding.ruleId === "security.injection.sql",
    )?.id;

    expect(findingId).toBeDefined();
    const result = await reviewPullRequest({
      ...input,
      securityQualityGate: {
        profile: "security/banking",
        evaluatedAt: "2026-08-31T10:00:00.000Z",
        baselineFindingIds: findingId === undefined ? [] : [findingId],
      },
    });

    expect(result.findings.some((finding) => finding.id === findingId)).toBe(true);
    expect(result.securityQualityGate?.summary.baseline).toBe(1);
    expect(result.decision).not.toBe("FAIL");
  });

  it("automatically baselines security debt outside changed lines", async () => {
    const result = await reviewPullRequest({
      title: "Change an unrelated line",
      files: [{
        path: "src/account-handler.ts",
        content: [
          'db.query("SELECT * FROM accounts WHERE id = " + req.query.id);',
          "export const label = 'updated';",
        ].join("\n"),
        patch: "@@ -2,1 +2,1 @@\n-export const label = 'old';\n+export const label = 'updated';",
        changedLines: [2],
      }],
      baseFiles: [{
        path: "src/account-handler.ts",
        content: [
          'db.query("SELECT * FROM accounts WHERE id = " + req.query.id);',
          "export const label = 'old';",
        ].join("\n"),
      }],
      securityQualityGate: {
        profile: "security/banking",
        evaluatedAt: "2026-08-31T10:00:00.000Z",
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.injection.sql", location: expect.objectContaining({ line: 1 }) }),
    ]));
    expect(result.securityQualityGate?.summary.baseline).toBeGreaterThan(0);
    expect(result.decision).not.toBe("FAIL");
  });
});
