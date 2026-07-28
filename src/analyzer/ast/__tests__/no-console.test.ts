import { describe, expect, it } from "vitest";

import { analyzeFile } from "../..";

describe("quality.no-console", () => {
  it("detects console.log()", () => {
    const findings = analyzeFile(
      "src/example.ts",
      `
        console.log("hello");
      `,
    );

    expect(
      findings.some(
        (finding) =>
          finding.ruleId === "quality.no-console",
      ),
    ).toBe(true);
  });
});