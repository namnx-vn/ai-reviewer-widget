import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../analyzer";
import {
  selectAIRepositoryContext,
  type AIContextBudget,
} from "../context-selector";

const budget: AIContextBudget = {
  maximumFiles: 2,
  maximumCharacters: 10_000,
  maximumDependencyDepth: 2,
  maximumRelatedSymbols: 4,
};

describe("AI repository context selector", () => {
  it("selects related modules and excludes unrelated files deterministically", () => {
    const files = [
      { path: "src/changed.ts", content: 'import { helper } from "./helper";\nexport const value = helper();' },
      { path: "src/helper.ts", content: 'import { core } from "./core";\nexport const helper = () => core;' },
      { path: "src/core.ts", content: "export const core = 1;" },
      { path: "src/unrelated.ts", content: "export const unrelated = true;" },
    ];
    const repositoryContext = buildRepositoryContext(files);

    const selected = selectAIRepositoryContext({
      files,
      changedPaths: ["src/changed.ts"],
      repositoryContext,
      budget,
    });

    expect(selected.files.map((file) => [file.path, file.dependencyDepth])).toEqual([
      ["src/helper.ts", 1],
      ["src/core.ts", 2],
    ]);
    expect(selected.files.flatMap((file) => file.relatedSymbols)).toContain("helper");
    expect(selected.files.map((file) => file.path)).not.toContain("src/unrelated.ts");
  });

  it("enforces explicit file, character, depth, and symbol budgets", () => {
    const files = [
      { path: "src/a.ts", content: 'import { b } from "./b";\nexport const a = b;' },
      { path: "src/b.ts", content: 'import { c } from "./c";\nexport const b = c;\nexport const extra = c;' },
      { path: "src/c.ts", content: "export const c = 1;" },
    ];
    const repositoryContext = buildRepositoryContext(files);
    const selected = selectAIRepositoryContext({
      files,
      changedPaths: ["src/a.ts"],
      repositoryContext,
      budget: {
        maximumFiles: 1,
        maximumCharacters: 20,
        maximumDependencyDepth: 1,
        maximumRelatedSymbols: 1,
      },
    });

    expect(selected.files).toHaveLength(1);
    expect(selected.files[0]?.path).toBe("src/b.ts");
    expect(selected.files[0]?.content.length).toBeLessThanOrEqual(20);
    expect(selected.files[0]?.relatedSymbols).toHaveLength(1);
    expect(selected.truncated).toBe(true);
  });

  it("rejects invalid budgets instead of silently expanding context", () => {
    const files = [{ path: "src/a.ts", content: "export const a = 1;" }];
    expect(() => selectAIRepositoryContext({
      files,
      changedPaths: ["src/a.ts"],
      repositoryContext: buildRepositoryContext(files),
      budget: { ...budget, maximumFiles: -1 },
    })).toThrow("AI context budget maximumFiles");
  });
});
