import { describe, expect, it } from "vitest";

import type { ReviewResult } from "../../domain/review";
import { createSarifDocument } from "../sarif";

function result(): ReviewResult {
  return {
    decision: "FAIL",
    score: 40,
    findings: [
      {
        id: "one", ruleId: "security.eval", title: "Unsafe eval", message: "Avoid eval.",
        severity: "critical", source: "security", confidence: 1,
        suggestion: "Use a parser.", location: { file: "./src/a file.ts", line: 7, column: 3 },
      },
      {
        id: "two", ruleId: "security.eval", title: "Unsafe eval", message: "Again.",
        severity: "low", source: "security", confidence: 0.9,
        location: { file: "../secret.ts", line: 1 },
      },
      {
        id: "three", ruleId: "quality.position", title: "Position", message: "At start.",
        severity: "medium", source: "ast", confidence: 1,
        location: { file: "src/start.ts", line: 1, column: 0 },
      },
      {
        id: "four", ruleId: "quality.invalid-position", title: "Position", message: "Invalid.",
        severity: "info", source: "ast", confidence: 1,
        location: { file: "src/invalid.ts", line: 0, column: -1 },
      },
      {
        id: "five", ruleId: "quality.invalid-column", title: "Position", message: "Invalid column.",
        severity: "info", source: "ast", confidence: 1,
        location: { file: "src/invalid-column.ts", line: 2, column: Number.NaN },
      },
      {
        id: "six", ruleId: "quality.overflow-column", title: "Position", message: "Overflow column.",
        severity: "info", source: "ast", confidence: 1,
        location: { file: "src/overflow-column.ts", line: 3, column: Number.MAX_SAFE_INTEGER },
      },
    ],
    stats: { critical: 1, high: 0, medium: 0, low: 1, info: 0 },
    warnings: [],
    durationMs: 2,
  };
}

describe("SARIF formatter", () => {
  it("emits SARIF 2.1.0 with unique rules and faithful result properties", () => {
    const sarif = createSarifDocument(result());
    const run = sarif.runs[0];

    expect(sarif).toMatchObject({ version: "2.1.0", $schema: expect.stringContaining("sarif-schema-2.1.0") });
    expect(run.tool.driver.rules).toHaveLength(5);
    expect(run.results[0]).toMatchObject({
      ruleId: "security.eval",
      level: "error",
      message: { text: "Avoid eval." },
      properties: { findingId: "one", severity: "critical", source: "security", confidence: 1, suggestion: "Use a parser." },
      locations: [{ physicalLocation: { artifactLocation: { uri: "src/a%20file.ts" }, region: { startLine: 7, startColumn: 4 } } }],
    });
    expect(run.results[1].level).toBe("note");
    expect(run.results[1]).not.toHaveProperty("locations");
    expect(run.results[2].locations?.[0].physicalLocation.region).toEqual({
      startLine: 1,
      startColumn: 1,
    });
    expect(run.results[3].locations?.[0].physicalLocation).toEqual({
      artifactLocation: { uri: "src/invalid.ts" },
    });
    expect(run.results[4].locations?.[0].physicalLocation.region).toEqual({ startLine: 2 });
    expect(run.results[5].locations?.[0].physicalLocation.region).toEqual({ startLine: 3 });
  });
});
