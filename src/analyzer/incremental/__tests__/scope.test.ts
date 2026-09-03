import { describe, expect, it } from "vitest";
import { buildRepositoryContext } from "../../repository-context";
import { calculateIncrementalAnalysisScope } from "../scope";

describe("calculateIncrementalAnalysisScope", () => {
  it("calculates changed ranges, exports, transitive dependents, packages, and metrics", () => {
    const files = [
      { path: "packages/core/package.json", content: JSON.stringify({ name: "@demo/core" }) },
      { path: "packages/core/src/value.ts", content: "export const value = 1;" },
      { path: "packages/core/src/index.ts", content: 'export * from "./value";' },
      { path: "packages/app/package.json", content: JSON.stringify({ name: "@demo/app" }) },
      { path: "packages/app/src/app.ts", content: 'import { value } from "@demo/core"; console.log(value);' },
    ];
    const context = buildRepositoryContext(files);
    let now = 10;
    const scope = calculateIncrementalAnalysisScope([{
      path: "packages/core/src/value.ts",
      status: "modified",
      ranges: [{ startLine: 1, endLine: 1 }],
    }], context, { now: () => (now += 5) });

    expect(scope.changedFiles).toEqual(["packages/core/src/value.ts"]);
    expect(scope.changedRanges["packages/core/src/value.ts"]).toEqual([{ startLine: 1, endLine: 1 }]);
    expect(scope.changedSymbols).toContain("packages/core/src/value.ts#value");
    expect(scope.changedExports).toContain("packages/core/src/value.ts#value");
    expect(scope.impactedFiles).toEqual([
      "packages/app/src/app.ts",
      "packages/core/src/index.ts",
      "packages/core/src/value.ts",
    ]);
    expect(scope.impactedPackages).toEqual(["@demo/app", "@demo/core"]);
    expect(scope.metrics).toEqual({ runtimeMs: 5, changedFileCount: 1, impactedFileCount: 3 });
  });

  it("represents deleted and renamed files without GitHub-specific types", () => {
    const context = buildRepositoryContext([
      { path: "src/old.ts", content: "export const oldValue = 1;" },
      { path: "src/consumer.ts", content: 'import { oldValue } from "./old"; oldValue;' },
      { path: "src/new.ts", content: "export const oldValue = 1;" },
    ]);

    const scope = calculateIncrementalAnalysisScope([
      { path: "src/old.ts", status: "deleted" },
      { path: "src/new.ts", previousPath: "src/old.ts", status: "renamed" },
    ], context, { now: () => 0 });

    expect(scope.deletedFiles).toEqual(["src/old.ts"]);
    expect(scope.renamedFiles).toEqual([{ from: "src/old.ts", to: "src/new.ts" }]);
    expect(scope.impactedFiles).toContain("src/consumer.ts");
  });
});
