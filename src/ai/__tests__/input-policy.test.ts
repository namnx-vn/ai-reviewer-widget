import { describe, expect, it } from "vitest";

import { prepareAIReviewDiff } from "../input-policy";

describe("AI review input policy", () => {
  it("omits files without patches and redacts common credential values", () => {
    const sensitiveValue = ["bank", "credential", "fixture"].join("-");
    const credentialKey = ["api", "Key"].join("");
    const result = prepareAIReviewDiff([
      { path: "src/unchanged.ts" },
      {
        path: "src/config.ts",
        patch: `+const ${credentialKey} = "${sensitiveValue}";\n+fetch(url, { authorization: "Bearer abc.def" });`,
      },
    ]);

    expect(result.omittedFiles).toBe(1);
    expect(result.redactedValues).toBeGreaterThan(0);
    expect(result.diff).toContain("FILE: src/config.ts");
    expect(result.diff).not.toContain(sensitiveValue);
    expect(result.diff).not.toContain("abc.def");
  });

  it("caps oversized patches deterministically", () => {
    const result = prepareAIReviewDiff([{
      path: "src/large.ts",
      patch: `+${"x".repeat(40_000)}`,
    }]);

    expect(result.truncated).toBe(true);
    expect(result.diff?.length).toBeLessThanOrEqual(30_020);
  });
});
