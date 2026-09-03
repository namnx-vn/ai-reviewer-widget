import { describe, expect, it } from "vitest";
import { createDeterministicAnalyzerAdapter } from "../../composition";

describe("repository context composition", () => {
  it("passes one shared context into analyzer contributions without breaking existing signatures", () => {
    let resolved: string | undefined;
    const adapter = createDeterministicAnalyzerAdapter({
      contributions: [{
        id: "test.repository-context",
        order: 999,
        analyze(_files, repositoryContext) {
          resolved = repositoryContext?.resolveImport("src/app.ts", "./value");
          return { findings: [], warnings: [] };
        },
      }],
    });

    adapter.analyze([
      { path: "src/value.ts", content: "export const value = 1;" },
      { path: "src/app.ts", content: 'import { value } from "./value"; value;' },
    ]);

    expect(resolved).toBe("src/value.ts");
  });
});
