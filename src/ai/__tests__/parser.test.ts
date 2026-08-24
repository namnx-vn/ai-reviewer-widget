import { describe, expect, it } from "vitest";

import { parseAIResult } from "../parser";

describe("parseAIResult", () => {
  it("rejects low-confidence findings", () => {
    const result = parseAIResult({
      findings: [
        {
          title: "Test",

          message: "Something",

          severity: "medium",

          confidence: 0.3,
        },
      ],
    });

    expect(result.findings).toHaveLength(0);
  });

  it("validates severity", () => {
    const result = parseAIResult({
      findings: [
        {
          title: "Test",

          message: "Something",

          severity: "invalid",

          confidence: 0.9,
        },
      ],
    });

    expect(result.findings).toHaveLength(0);
  });

  it("rejects non-finite confidence, invalid locations, and oversized text", () => {
    const result = parseAIResult({
      findings: [
        {
          title: "Non-finite",
          message: "Invalid confidence",
          severity: "high",
          confidence: Number.NaN,
        },
        {
          title: "x".repeat(301),
          message: "Oversized title",
          severity: "medium",
          confidence: 0.9,
        },
        {
          title: "Valid finding",
          message: "Invalid locations are omitted.",
          severity: "low",
          confidence: 0.9,
          file: "src/example.ts",
          line: -1,
        },
      ],
    });

    expect(result.findings).toEqual([expect.objectContaining({
      title: "Valid finding",
      file: "src/example.ts",
      line: undefined,
    })]);
  });

  it("retains only validated specialist warnings and agent identifiers", () => {
    const result = parseAIResult({
      findings: [{
        title: "Authorization issue",
        message: "The route trusts a client role.",
        severity: "high",
        confidence: 0.9,
        agent: "security",
      }],
      warnings: [
        {
          code: "AI_AGENT_FAILED",
          agent: "react",
          message: "React specialist unavailable.",
        },
        {
          code: "AI_AGENT_FAILED",
          agent: "unknown",
          message: "Invalid specialist.",
        },
      ],
    });

    expect(result.findings[0]?.agent).toBe("security");
    expect(result.warnings).toEqual([{
      code: "AI_AGENT_FAILED",
      agent: "react",
      message: "React specialist unavailable.",
    }]);
  });

  it("caps custom-adapter finding and warning counts", () => {
    const finding = {
      title: "Bounded finding",
      message: "Validated output.",
      severity: "info",
      confidence: 0.9,
    };
    const warning = {
      code: "AI_AGENT_FAILED",
      agent: "react",
      message: "Specialist unavailable.",
    };
    const result = parseAIResult({
      findings: Array.from({ length: 120 }, () => finding),
      warnings: Array.from({ length: 30 }, () => warning),
    });

    expect(result.findings).toHaveLength(100);
    expect(result.warnings).toHaveLength(20);
  });
});
