import { describe, expect, it } from "vitest";
import { buildRepositoryContext } from "../indexer";

describe("buildRepositoryContext", () => {
  it("indexes imports, declarations, barrel exports, and circular imports deterministically", () => {
    const context = buildRepositoryContext([
      { path: "src/a.ts", content: 'import { b } from "./b"; export const a = b;' },
      { path: "src/b.ts", content: 'import { a } from "./a"; export const b = a;' },
      { path: "src/index.ts", content: 'export * from "./a"; export { b as renamedB } from "./b";' },
    ]);

    expect(context.resolveImport("src/a.ts", "./b")).toBe("src/b.ts");
    expect(context.resolveDeclaration("src/index.ts", "a")).toMatchObject({ file: "src/a.ts", name: "a" });
    expect(context.resolveDeclaration("src/index.ts", "renamedB")).toMatchObject({ file: "src/b.ts", name: "b" });
    expect(context.resolveDeclaration("src/a.ts", "missing")).toBeUndefined();
    expect(context.imports.map(({ from, specifier }) => `${from}:${specifier}`)).toEqual([
      "src/a.ts:./b",
      "src/b.ts:./a",
    ]);
  });

  it("resolves tsconfig aliases and imported declarations conservatively", () => {
    const context = buildRepositoryContext([
      {
        path: "tsconfig.json",
        content: JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/*": ["src/lib/*"] } } }),
      },
      { path: "src/lib/value.ts", content: "export function value() { return 1; }" },
      { path: "src/app.ts", content: 'import { value as readValue } from "@lib/value"; readValue();' },
    ]);

    expect(context.resolveImport("src/app.ts", "@lib/value")).toBe("src/lib/value.ts");
    expect(context.resolveImportedDeclaration("src/app.ts", "readValue")).toMatchObject({
      file: "src/lib/value.ts",
      name: "value",
      kind: "function",
    });
  });

  it("represents multi-package boundaries and package-local imports", () => {
    const context = buildRepositoryContext([
      { path: "packages/core/package.json", content: JSON.stringify({ name: "@demo/core" }) },
      { path: "packages/core/src/index.ts", content: "export class Core {}" },
      { path: "packages/app/package.json", content: JSON.stringify({ name: "@demo/app", dependencies: { react: "19.0.0", next: "15.0.0" } }) },
      { path: "packages/app/src/app.ts", content: 'import { Core } from "@demo/core"; new Core();' },
    ]);

    expect(context.packages).toHaveLength(2);
    expect(context.resolveImport("packages/app/src/app.ts", "@demo/core")).toBe("packages/core/src/index.ts");
    expect(context.projectSignals).toMatchObject({ hasReact: true, hasNextJs: true });
  });

  it("keeps unresolved imports explicit and safe", () => {
    const context = buildRepositoryContext([
      { path: "src/app.ts", content: 'import value from "unknown-package"; value();' },
    ]);

    expect(context.imports[0]).toMatchObject({
      from: "src/app.ts",
      specifier: "unknown-package",
      resolvedPath: undefined,
    });
  });
});
