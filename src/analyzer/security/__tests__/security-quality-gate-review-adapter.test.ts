import { describe, expect, it } from "vitest";

import {
  evaluateSecurityReviewQualityGate,
  toSecurityQualityGateFindings,
} from "../quality-gate";
import type { ReviewFinding } from "../../../review/types";

describe("security quality-gate review adapter", () => {
  const evaluatedAt = "2026-07-27T14:00:00+07:00";

  it("consumes only security findings from the review domain", () => {
    const result = evaluateSecurityReviewQualityGate({
      findings: [
        reviewFinding("security.injection.sql", "security", "high", 0.98, "security-1"),
        reviewFinding("ast.no-console", "ast", "high", 1, "ast-1"),
      ],
      profile: "security/banking",
      evaluatedAt,
    });

    expect(result.decision).toBe("fail");
    expect(result.summary.total).toBe(1);
    expect(result.findings[0]?.findingId).toBe("security-1");
  });

  it("normalizes deterministic and React-style numeric confidence consistently", () => {
    const findings = toSecurityQualityGateFindings([
      reviewFinding("security.example.high", "security", "medium", 0.96, "high"),
      reviewFinding("security.example.medium", "security", "medium", 0.75, "medium"),
      reviewFinding("security.example.low", "security", "medium", 0.5, "low"),
    ]);

    expect(findings.map((finding) => finding.confidence)).toEqual(["high", "medium", "low"]);
  });
});

function reviewFinding(
  ruleId: string,
  source: ReviewFinding["source"],
  severity: ReviewFinding["severity"],
  confidence: number,
  id: string,
): ReviewFinding {
  return {
    id,
    ruleId,
    title: "Quality gate adapter test",
    message: "Deterministic finding.",
    severity,
    source,
    confidence,
  };
}
