
import { describe, expect, it } from "vitest";

import { analyzeFile } from "../..";

describe("security.no-eval", () => {
  it("detects eval()", () => {
    const findings = analyzeFile(
      "src/example.ts",
      `
        const result = eval(input);
      `,
    );

    expect(
      findings.some(
        (finding) =>
          finding.ruleId === "security.no-eval",
      ),
    ).toBe(true);
  });
});