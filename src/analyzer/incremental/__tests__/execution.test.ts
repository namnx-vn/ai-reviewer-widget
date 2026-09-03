import { describe, expect, it } from "vitest";
import type { ReviewFinding } from "../../../domain/review";
import { createDeterministicAnalyzerAdapter } from "../../composition";
import { buildRepositoryContext } from "../../repository-context";
import { calculateIncrementalAnalysisScope } from "../scope";

function finding(file: string, line = 1): ReviewFinding {
  return {
    id: `test:${file}:${line}`,
    ruleId: "test.scope",
    title: "Scoped finding",
    message: "Scoped finding",
    severity: "low",
    source: "ast",
    confidence: 1,
    location: { file, line },
  };
}

describe("incremental contribution execution", () => {
  it("keeps legacy contributions repository-scoped and narrows opted-in contributions", () => {
    const files = [
      { path: "src/value.ts", content: "export const value = 1;" },
      { path: "src/app.ts", content: 'import { value } from "./value"; value;' },
      { path: "src/unrelated.ts", content: "export const unrelated = 1;" },
    ];
    const context = buildRepositoryContext(files);
    const scope = calculateIncrementalAnalysisScope([
      { path: "src/value.ts", status: "modified", ranges: [{ startLine: 1, endLine: 1 }] },
    ], context, { now: () => 0 });
    const seen: Record<string, readonly string[]> = {};
    const adapter = createDeterministicAnalyzerAdapter({
      contributions: [
        {
          id: "legacy.repository",
          order: 900,
          analyze(input) {
            seen.repository = input.map(({ path }) => path);
            return { findings: [], warnings: [] };
          },
        },
        {
          id: "test.affected",
          order: 901,
          executionScope: "affected-module",
          analyze(input) {
            seen.affected = input.map(({ path }) => path);
            return { findings: [], warnings: [] };
          },
        },
        {
          id: "test.changed",
          order: 902,
          executionScope: "changed-file",
          analyze(input) {
            seen.changed = input.map(({ path }) => path);
            return { findings: [], warnings: [] };
          },
        },
      ],
    });

    adapter.analyze(files, undefined, scope);

    expect(seen.repository).toEqual(["src/value.ts", "src/app.ts", "src/unrelated.ts"]);
    expect(seen.affected).toEqual(["src/value.ts", "src/app.ts"]);
    expect(seen.changed).toEqual(["src/value.ts"]);
  });

  it("filters changed-range findings while preserving findings without location evidence", () => {
    const files = [{ path: "src/value.ts", content: "export const value = 1;\nexport const other = 2;" }];
    const context = buildRepositoryContext(files);
    const scope = calculateIncrementalAnalysisScope([
      { path: "src/value.ts", status: "modified", ranges: [{ startLine: 2, endLine: 2 }] },
    ], context, { now: () => 0 });
    const adapter = createDeterministicAnalyzerAdapter({
      contributions: [{
        id: "test.range",
        order: 900,
        executionScope: "changed-range",
        analyze() {
          return {
            findings: [finding("src/value.ts", 1), finding("src/value.ts", 2), {
              ...finding("src/value.ts", 3),
              id: "without-location",
              location: undefined,
            }],
            warnings: [],
          };
        },
      }],
    });

    const result = adapter.analyze(files, undefined, scope);
    expect(result.findings.map(({ id }) => id)).toEqual(["test:src/value.ts:2", "without-location"]);
  });
});
