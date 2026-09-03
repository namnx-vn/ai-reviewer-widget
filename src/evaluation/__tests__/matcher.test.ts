import { describe, expect, it } from "vitest";
import type { ReviewFinding } from "../../domain/review";
import { matchFindings } from "../matcher";

const finding = (overrides: Partial<ReviewFinding> = {}): ReviewFinding => ({
  id: "actual-1",
  ruleId: "security/demo",
  title: "Demo",
  message: "demo finding",
  severity: "high",
  source: "security",
  confidence: 1,
  location: { file: "src/demo.ts", line: 4 },
  ...overrides,
});

describe("matchFindings", () => {
  it("matches one actual finding at most once", () => {
    const result = matchFindings([
      { id: "expected-1", ruleId: "security/demo", severity: "high", file: "src/demo.ts", line: 4 },
      { id: "expected-2", ruleId: "security/demo", severity: "high", file: "src/demo.ts", line: 4 },
    ], [finding()]);

    expect(result.matches).toHaveLength(1);
    expect(result.falseNegatives).toHaveLength(1);
    expect(result.falsePositives).toHaveLength(0);
  });

  it("reports unmatched actual findings as false positives", () => {
    const result = matchFindings([], [finding()]);
    expect(result.falsePositives).toHaveLength(1);
  });
});
