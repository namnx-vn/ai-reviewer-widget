import { describe, expect, it } from "vitest";

import { MultiAgentAIProvider } from "../multi-agent-provider";
import type {
  AIProvider,
  AIReviewAgentId,
  AIReviewInput,
  AIReviewResult,
} from "../types";

const input: AIReviewInput = {
  pullRequestTitle: "Review multi-agent changes",
  diff: "diff --git a/src/app.ts b/src/app.ts",
  deterministicFindings: "[]",
};

describe("MultiAgentAIProvider", () => {
  it("runs specialist agents and merges duplicate findings by confidence", async () => {
    const calls: AIReviewInput[] = [];
    const provider: AIProvider = {
      name: "test",
      review: async (reviewInput) => {
        calls.push(reviewInput);
        return resultForAgent(reviewInput.focus?.agent);
      },
    };

    const result = await new MultiAgentAIProvider(provider).review(input);

    expect(calls.map((call) => call.focus?.agent)).toEqual([
      "security",
      "react",
      "architecture",
    ]);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({
      title: "Shared boundary issue",
      confidence: 0.91,
      agent: "react",
    });
    expect(result.findings[1]).toMatchObject({
      title: "Architecture issue",
      agent: "architecture",
    });
    expect(result.warnings).toEqual([]);
  });

  it("retains successful reviews when one specialist fails", async () => {
    const provider: AIProvider = {
      name: "test",
      review: async (reviewInput) => {
        if (reviewInput.focus?.agent === "react") {
          throw new Error("react reviewer unavailable");
        }

        return { findings: [] };
      },
    };

    const result = await new MultiAgentAIProvider(provider).review(input);

    expect(result.warnings).toEqual([{
      code: "AI_AGENT_FAILED",
      agent: "react",
      message: "react AI review agent was unavailable; other review results were retained.",
    }]);
  });

  it("fails when every specialist review fails", async () => {
    const provider: AIProvider = {
      name: "test",
      review: async () => Promise.reject(new Error("unavailable")),
    };

    await expect(
      new MultiAgentAIProvider(provider).review(input),
    ).rejects.toThrow("All specialist AI review agents failed.");
  });
});

function resultForAgent(
  agent: AIReviewAgentId | undefined,
): AIReviewResult {
  if (agent === "security") {
    return {
      findings: [{
        title: "Shared boundary issue",
        message: "Security interpretation",
        severity: "high",
        confidence: 0.72,
        file: "src/app.ts",
        line: 10,
      }],
    };
  }

  if (agent === "react") {
    return {
      findings: [{
        title: "Shared boundary issue",
        message: "React interpretation",
        severity: "high",
        confidence: 0.91,
        file: "src/app.ts",
        line: 10,
      }],
    };
  }

  return {
    findings: [{
      title: "Architecture issue",
      message: "Layering regression",
      severity: "medium",
      confidence: 0.88,
      file: "src/app.ts",
      line: 20,
    }],
  };
}
