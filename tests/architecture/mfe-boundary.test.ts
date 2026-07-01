import { describe, expect, it } from "vitest";

import { analyzeFile } from "../../src/analyzer";

describe("Micro-Frontend boundaries", () => {
  it("rejects remote-to-remote imports", () => {
    const findings = analyzeFile(
      "src/remote/Checkout.tsx",
      `
        import Payment from "@remote/payment";
      `,
    );

    expect(
      findings.some(
        (finding) =>
          finding.ruleId ===
          "mfe.no-remote-to-remote",
      ),
    ).toBe(true);
  });

  it("allows shared package imports", () => {
    const findings = analyzeFile(
      "src/remote/Checkout.tsx",
      `
        import Button from "@shared/ui";
      `,
    );

    expect(
      findings.some(
        (finding) =>
          finding.ruleId ===
          "mfe.no-remote-to-remote",
      ),
    ).toBe(false);
  });
});