import { describe, expect, it } from "vitest";

import { analyzeAST } from "../analyzer";
import { manifestStreamedBodyRule } from "../rules/manifest-streaming";

describe("streamed manifest placement", () => {
  it("detects escaped manifest markup in streamed body metadata", () => {
    const escapedQuote = "\\\"";
    const source = [
      "export function renderMetadata(manifest: string) {",
      `  const body = [\`<link rel=${escapedQuote}manifest${escapedQuote} href=${escapedQuote}\${manifest}${escapedQuote}>\`];`,
      "  return { body };",
      "}",
    ].join("\n");
    const findings = analyzeAST(source, "src/metadata.ts", [manifestStreamedBodyRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "quality.web.manifest-streamed-body",
    );
  });
});
