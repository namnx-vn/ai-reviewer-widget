import { describe, expect, it } from "vitest";

import { ReviewEngine } from "../../src/engine/review-engine";
import type { AIProvider } from "../../src/ai/types";
import type { ReviewFinding } from "../../src/review/types";

const deterministicFinding: ReviewFinding = {
  id: "ast-1",
  ruleId: "security.no-eval",
  title: "Avoid eval",
  message: "eval executes untrusted code.",
  severity: "critical",
  source: "ast",
  confidence: 0.25,
};

describe("ReviewEngine", () => {
  it("normalizes, deduplicates, and prioritizes deterministic findings", async () => {
    const provider: AIProvider = {
      name: "test",
      review: async () => ({
        findings: [{
          title: "Avoid eval",
          message: "eval executes untrusted code.",
          severity: "critical",
          confidence: 0.9,
        }],
      }),
    };

    const result = await new ReviewEngine().execute({
      deterministicFindings: [deterministicFinding],
      aiProvider: provider,
      aiInput: {
        pullRequestTitle: "Test",
        diff: "",
        deterministicFindings: "[]",
      },
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.source).toBe("ast");
    expect(result.findings[0]?.confidence).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("returns deterministic results and a warning when AI review fails", async () => {
    const provider: AIProvider = {
      name: "test",
      review: async () => Promise.reject(new Error("service unavailable")),
    };

    const result = await new ReviewEngine().execute({
      deterministicFindings: [deterministicFinding],
      aiProvider: provider,
      aiInput: {
        pullRequestTitle: "Test",
        diff: "",
        deterministicFindings: "[]",
      },
    });

    expect(result.findings).toHaveLength(1);
    expect(result.warnings).toEqual([{
      code: "AI_REVIEW_FAILED",
      message: "AI review was unavailable; deterministic results were returned.",
    }]);
  });

  it("keeps high-confidence AI findings and downgrades low-confidence ones", async () => {
    const provider: AIProvider = {
      name: "test",
      review: async () => ({
        findings: [
          { title: "Low confidence", message: "Review this", severity: "high", confidence: 0.7 },
          { title: "High confidence", message: "Review this too", severity: "medium", confidence: 0.9 },
        ],
      }),
    };

    const result = await new ReviewEngine().execute({
      deterministicFindings: [],
      aiProvider: provider,
      aiInput: { pullRequestTitle: "Test", diff: "", deterministicFindings: "[]" },
    });

    expect(result.findings.map(({ title, severity, confidence }) => ({ title, severity, confidence }))).toEqual([
      { title: "Low confidence", severity: "medium", confidence: 0.7 },
      { title: "High confidence", severity: "medium", confidence: 0.9 },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("does not invoke AI unless both a provider and review input are supplied", async () => {
    const review = async () => ({ findings: [] });
    const provider: AIProvider = { name: "test", review };

    const result = await new ReviewEngine().execute({
      deterministicFindings: [deterministicFinding],
      aiProvider: provider,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});
