import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GitHub Actions CI adapter", () => {
  it("keeps checkout external and uploads portable artifacts even after review failure", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ai-review.yml"), "utf-8");

    expect(workflow).toContain("uses: actions/checkout@v4");
    expect(workflow).toContain("run: npm run review:pr");
    expect(workflow).toContain("if: always() && steps.ai-review.outcome != 'skipped'");
    expect(workflow).toContain("path: ai-reviewer-artifacts");
    expect(workflow).toContain("if-no-files-found: warn");
  });
});
