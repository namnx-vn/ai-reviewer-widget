import { describe, expect, it } from "vitest";

import type { AIProvider } from "../../src/ai/types";
import {
  convertAIFindings,
  reviewFiles,
  reviewPullRequest,
} from "../../src/review/reviewer";

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
