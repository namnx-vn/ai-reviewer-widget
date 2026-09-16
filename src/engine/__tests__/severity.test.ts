import {
  describe,
  expect,
  it,
} from "vitest";

import {
  adjustSeverity,
} from "../severity";

import type {
  ReviewFinding,
} from "../../review/types";

function createFinding(
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding {
  return {
    id: "test",

    ruleId:
      "ai.test",

    title:
      "Test finding",

    message:
      "Test message",

    severity:
      "critical",

    source: "ai",

    confidence: 0.5,

    ...overrides,
  };
}

describe(
  "adjustSeverity",
  () => {
    it.each([
      ["critical", "high"], ["high", "medium"], ["medium", "low"], ["low", "info"], ["info", "info"],
    ] as const)("downgrades independently supported low-confidence %s to %s", (severity, expected) => {
      const [finding] = adjustSeverity([createFinding({
        severity, evidence: { status: "supported", provenance: [{ kind: "deterministic-finding", reference: "security.no-eval@src/app.ts:10" }] },
      })]);
      expect(finding.severity).toBe(expected);
    });

    it("retains severity for a supported conclusion with sufficient confidence", () => {
      const [finding] = adjustSeverity([createFinding({
        confidence: 0.9,
        evidence: { status: "supported", provenance: [{ kind: "deterministic-finding", reference: "security.no-eval@src/app.ts:10" }] },
      })]);
      expect(finding.severity).toBe("critical");
    });

    it("requires deterministic provenance rather than a supported status alone", () => {
      const [finding] = adjustSeverity([createFinding({
        confidence: 1, evidence: { status: "supported", provenance: [{ kind: "repository-file", reference: "src/app.ts" }] },
      })]);
      expect(finding.severity).toBe("info");
    });
    it(
      "keeps unverified AI findings advisory even when originally critical",
      () => {
        const result =
          adjustSeverity([
            createFinding(),
          ]);

        expect(
          result[0].severity,
        ).toBe("info");
      },
    );

    it(
      "does not let raw high confidence make AI findings severe",
      () => {
        const result =
          adjustSeverity([
            createFinding({
              confidence: 0.95,
            }),
          ]);

        expect(
          result[0].severity,
        ).toBe("info");
      },
    );

    it(
      "does not change deterministic findings",
      () => {
        const result =
          adjustSeverity([
            createFinding({
              source: "ast",

              confidence: 1,
            }),
          ]);

        expect(
          result[0].severity,
        ).toBe("critical");
      },
    );
  },
);
