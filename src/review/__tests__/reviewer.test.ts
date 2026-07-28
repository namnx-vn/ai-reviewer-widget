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
        { path: "src/valid.ts", content: "eval('input');" },
        {
          path: "src/Broken.tsx",
          content: "export function Broken() { return <div>; }",
        },
      ],
    }, provider);

    expect(review).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([{
      code: "SOURCE_PARSE_FAILED",
      message: "Skipped deterministic analysis for src/Broken.tsx because it could not be parsed.",
    }]);
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
      files: [{ path: "src/example.ts", content: "eval('input');" }],
    }, provider);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.no-eval", confidence: 1 }),
      expect.objectContaining({ title: "Potential concern", severity: "medium", source: "ai" }),
    ]));
    expect(result.warnings).toEqual([]);
  });
});
