import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateScore,
} from "../../src/review/scorer";

describe("review scorer", () => {
  it("starts at 100", () => {
    expect(
      calculateScore([]),
    ).toBe(100);
  });

  it("deducts critical findings", () => {
    expect(
      calculateScore([
        {
          id: "1",
          ruleId: "security.test",
          title: "Security issue",
          message: "Unsafe",
          severity: "critical",
          source: "ast",
        },
      ]),
    ).toBe(70);
  });
});