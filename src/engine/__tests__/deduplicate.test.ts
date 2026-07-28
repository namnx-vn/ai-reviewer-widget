import {
  describe,
  expect,
  it,
} from "vitest";

import {
  deduplicateFindings,
} from "../deduplicate";

import type {
  ReviewFinding,
} from "../../review/types";

const base: ReviewFinding = {
  id: "1",

  ruleId:
    "security.no-eval",

  title:
    "Unsafe eval usage",

  message:
    "eval is dangerous",

  severity:
    "critical",

  source: "ast",

  confidence: 1,

  location: {
    file:
      "src/app.ts",

    line: 10,
  },
};

describe(
  "deduplicateFindings",
  () => {
    it(
      "keeps deterministic finding",
      () => {
        const ai: ReviewFinding = {
          ...base,

          id: "2",

          source: "ai",

          confidence: 0.9,
        };

        const result =
          deduplicateFindings([
            base,
            ai,
          ]);

        expect(
          result,
        ).toHaveLength(1);

        expect(
          result[0].source,
        ).toBe("ast");
      },
    );
  },
);