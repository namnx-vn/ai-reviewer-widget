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
    it(
      "downgrades low-confidence AI findings",
      () => {
        const result =
          adjustSeverity([
            createFinding(),
          ]);

        expect(
          result[0].severity,
        ).toBe("high");
      },
    );

    it(
      "keeps high-confidence findings",
      () => {
        const result =
          adjustSeverity([
            createFinding({
              confidence: 0.95,
            }),
          ]);

        expect(
          result[0].severity,
        ).toBe("critical");
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