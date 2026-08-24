import { describe, expect, it } from "vitest";

import { prepareAIReviewContext, prepareAIReviewDiff } from "../input-policy";

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

  it("redacts and bounds pull-request metadata and deterministic findings", () => {
    const secret = ["private", "credential", "fixture"].join("-");
    const result = prepareAIReviewContext({
      title: `Rotate token=${secret}`,
      description: `authorization: Bearer ${secret}`,
      deterministicFindings: JSON.stringify([{
        message: `password=${secret}`,
        evidence: "x".repeat(40_000),
      }]),
      files: [{ path: "src/example.ts", patch: "+export const value = 1;" }],
    });

    expect(result.title).not.toContain(secret);
    expect(result.description).not.toContain(secret);
    expect(result.deterministicFindings).not.toContain(secret);
    expect(result.deterministicFindings.length).toBeLessThanOrEqual(30_000);
    expect(result.redactedValues).toBeGreaterThanOrEqual(3);
    expect(result.truncated).toBe(true);
  });

  it("redacts sensitive values embedded in file paths", () => {
    const secret = ["path", "credential", "fixture"].join("-");
    const result = prepareAIReviewDiff([{
      path: `src/token=${secret}.ts`,
      patch: "+export const value = 1;",
    }]);

    expect(result.diff).not.toContain(secret);
    expect(result.redactedValues).toBe(1);
  });
});
