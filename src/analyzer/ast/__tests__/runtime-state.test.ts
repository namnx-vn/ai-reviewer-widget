import { describe, expect, it } from "vitest";

import { analyzeFiles } from "../../index";
import { analyzeAST } from "../analyzer";
import {
  nullableHydrationStateRule,
  searchParamMultivalueKeyRule,
} from "../rules/runtime-state";

describe("core runtime-state correctness rules", () => {
  it("detects nullable hydration state dereferenced from the nullable root", () => {
    const findings = analyzeAST(`
      interface DehydratedState {
        readonly mutations?: readonly unknown[];
      }

      export function hydrateOnClient(state: DehydratedState | null): number {
        return state.mutations?.length ?? 0;
      }
    `, "src/hydration.ts", [nullableHydrationStateRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "quality.correctness.nullable-hydration-state",
    );
  });

  it("accepts a null guard and optional chaining from the nullable root", () => {
    const guarded = analyzeAST(`
      interface DehydratedState { readonly mutations?: readonly unknown[] }
      export function hydrateOnClient(state: DehydratedState | null): number {
        if (!state) return 0;
        return state.mutations?.length ?? 0;
      }
    `, "src/guarded.ts", [nullableHydrationStateRule]);

    const optional = analyzeAST(`
      interface DehydratedState { readonly mutations?: readonly unknown[] }
      export function hydrateOnClient(state: DehydratedState | null): number {
        return state?.mutations?.length ?? 0;
      }
    `, "src/optional.ts", [nullableHydrationStateRule]);

    expect(guarded).toHaveLength(0);
    expect(optional).toHaveLength(0);
  });

  it("detects repeated search parameters collapsed inside cache identity", () => {
    const findings = analyzeAST(`
      export function createPageCacheKey(renderedSearch: string): string {
        const query = Object.fromEntries(new URLSearchParams(renderedSearch));
        return \`__PAGE__?\${JSON.stringify(query)}\`;
      }
    `, "src/cache.ts", [searchParamMultivalueKeyRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "quality.correctness.search-param-multivalue-key",
    );
  });

  it("does not report ordinary search-parameter object conversion outside identity construction", () => {
    const findings = analyzeAST(`
      export function parseSearch(renderedSearch: string) {
        return Object.fromEntries(new URLSearchParams(renderedSearch));
      }
    `, "src/search.ts", [searchParamMultivalueKeyRule]);

    expect(findings).toHaveLength(0);
  });

  it("runs both rules through the default production analyzer composition", () => {
    const result = analyzeFiles([
      {
        path: "src/hydration.ts",
        content: `
          interface DehydratedState { readonly mutations?: readonly unknown[] }
          export function hydrateOnClient(state: DehydratedState | null): number {
            return state.mutations?.length ?? 0;
          }
        `,
      },
      {
        path: "src/cache.ts",
        content: `
          export function createPageCacheKey(search: string): string {
            return JSON.stringify(Object.fromEntries(new URLSearchParams(search)));
          }
        `,
      },
    ]);

    expect(result.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "quality.correctness.nullable-hydration-state",
        "quality.correctness.search-param-multivalue-key",
      ]),
    );
  });
});
