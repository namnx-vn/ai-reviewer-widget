import { describe, expect, it } from "vitest";

import type { ReviewFinding } from "../../domain/review";
import { verifyAIFindings } from "../verification";

const deterministic: ReviewFinding = {
  id: "security-1",
  ruleId: "security.no-eval",
  title: "Avoid eval",
  message: "eval executes untrusted code.",
  severity: "high",
  source: "security",
  confidence: 0.95,
  location: { file: "src/app.ts", line: 10 },
};

describe("AI finding verification", () => {
  it("attaches deterministic provenance and raises confidence only when supported", () => {
    const [finding] = verifyAIFindings([{
      title: "Potential code execution",
      message: "Review dynamic execution.",
      severity: "high",
      confidence: 0.6,
      file: "src/app.ts",
      line: 10,
    }], {
      deterministicFindings: [deterministic],
      knownFiles: ["src/app.ts"],
    });

    expect(finding).toMatchObject({
      confidence: 0.95,
      evidence: {
        status: "supported",
        provenance: [
          { kind: "repository-file", reference: "src/app.ts" },
          { kind: "deterministic-finding", reference: "security-1" },
        ],
      },
    });
  });

  it("reduces confidence for a file outside verified repository context", () => {
    const [finding] = verifyAIFindings([{
      title: "Unknown file",
      message: "Claim references a file that was not reviewed.",
      severity: "high",
      confidence: 0.9,
      file: "src/not-present.ts",
    }], {
      deterministicFindings: [deterministic],
      knownFiles: ["src/app.ts"],
    });

    expect(finding?.confidence).toBe(0.4);
    expect(finding?.evidence).toEqual({ status: "unsupported", provenance: [] });
  });

  it("preserves confidence when evidence is capability-unverifiable", () => {
    const [finding] = verifyAIFindings([{
      title: "Architectural concern",
      message: "This coupling may be hard to maintain.",
      severity: "medium",
      confidence: 0.7,
      file: "src/app.ts",
      line: 100,
    }], {
      deterministicFindings: [deterministic],
      knownFiles: ["src/app.ts"],
    });

    expect(finding?.confidence).toBe(0.7);
    expect(finding?.evidence).toEqual({
      status: "unverifiable",
      provenance: [{ kind: "repository-file", reference: "src/app.ts" }],
    });
  });

  it("degrades safely when verification input is malformed at runtime", () => {
    const findings = [{
      title: "Safe fallback",
      message: "Keep the provider finding.",
      severity: "medium" as const,
      confidence: 0.6,
    }];
    const verified = verifyAIFindings(findings, {
      deterministicFindings: [],
      knownFiles: [],
    });

    expect(verified[0]).toMatchObject({
      confidence: 0.6,
      evidence: { status: "unverifiable", provenance: [] },
    });
  });
});
