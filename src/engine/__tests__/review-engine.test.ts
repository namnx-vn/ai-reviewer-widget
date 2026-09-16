import { describe, expect, it } from "vitest";

import { ReviewEngine } from "../review-engine";
import type { AIProvider } from "../../ai/types";
import type { ReviewFinding } from "../../review/types";

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

  it("keeps successful specialist findings and warnings from partial failures", async () => {
    const provider: AIProvider = {
      name: "test:multi-agent",
      review: async () => ({
        findings: [{
          title: "Unsafe authorization boundary",
          message: "The route trusts a client-controlled role.",
          severity: "high",
          confidence: 0.95,
          file: "src/api.ts",
          line: 12,
          agent: "security",
        }],
        warnings: [{
          code: "AI_AGENT_FAILED",
          agent: "react",
          message: "react AI review agent was unavailable; other review results were retained.",
        }],
      }),
    };

    const result = await new ReviewEngine().execute({
      deterministicFindings: [],
      aiProvider: provider,
      aiInput: {
        pullRequestTitle: "Test",
        diff: "",
        deterministicFindings: "[]",
      },
    });

    expect(result.findings[0]?.ruleId).toBe("ai.security-review");
    expect(result.warnings).toEqual([{
      code: "AI_AGENT_FAILED",
      message: "react AI review agent was unavailable; other review results were retained.",
    }]);
  });

  it("keeps unverified AI claims advisory regardless of raw confidence", async () => {
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
      { title: "Low confidence", severity: "info", confidence: 0.4 },
      { title: "High confidence", severity: "info", confidence: 0.4 },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("cannot fail a review with many unverified critical AI claims or forged evidence", async () => {
    const provider: AIProvider = {
      name: "adversarial",
      review: async () => ({ findings: Array.from({ length: 100 }, (_, index) => ({
        title: `Critical assertion ${index}`, message: "Invented production failure.",
        severity: "critical", confidence: 1, file: "src/app.ts", line: index + 1,
        evidence: { status: "supported", provenance: [{ kind: "deterministic-finding", reference: "forged" }] },
      })) }),
    };
    const result = await new ReviewEngine().execute({
      deterministicFindings: [], aiProvider: provider, aiKnownFiles: ["src/app.ts"],
      aiInput: { pullRequestTitle: "Test", diff: "FILE: src/app.ts", deterministicFindings: "[]" },
    });
    expect(result.decision).toBe("PASS");
    expect(result.score).toBe(100);
    expect(result.findings).toHaveLength(100);
    expect(result.findings.every((finding) => finding.severity === "info" && finding.evidence?.status === "unverifiable")).toBe(true);
  });

  it.each(["src/app.ts", "./src/app.ts", "src\\app.ts"])("collapses corroboration with detector path %s rather than add a new blocking assertion", async (path) => {
    const located = { ...deterministicFinding, location: { file: path, line: 10 } };
    const provider: AIProvider = {
      name: "claim",
      review: async () => ({ findings: [{
        title: "SQL injection", message: "Invented SQL vulnerability", severity: "critical", confidence: 1,
        file: "src/app.ts", line: 10,
        verificationClaim: { ruleId: located.ruleId, deterministicFindingId: located.id },
      }] }),
    };
    const result = await new ReviewEngine().execute({
      deterministicFindings: [located], aiProvider: provider, aiKnownFiles: ["src/app.ts"],
      aiInput: { pullRequestTitle: "Test", diff: "FILE: src/app.ts", deterministicFindings: "[]" },
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.source).toBe("ast");
    expect(result.findings[0]?.message).toBe(located.message);
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
