import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseAIResult,
} from "../../src/ai/parser";

describe(
  "parseAIResult",
  () => {
    it(
      "rejects low-confidence findings",
      () => {
        const result =
          parseAIResult({
            findings: [
              {
                title: "Test",

                message:
                  "Something",

                severity:
                  "medium",

                confidence:
                  0.3,
              },
            ],
          });

        expect(
          result.findings,
        ).toHaveLength(0);
      },
    );

    it(
      "validates severity",
      () => {
        const result =
          parseAIResult({
            findings: [
              {
                title: "Test",

                message:
                  "Something",

                severity:
                  "invalid",

                confidence:
                  0.9,
              },
            ],
          });

        expect(
          result.findings,
        ).toHaveLength(0);
      },
    );
  },
);