import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../engine/react-engine";
import type { ReactRule } from "../../../engine/react-rule";
import {
  reactPatternsNullableHydrationStateRule,
  reactPatternsSearchParamMultivalueKeyRule,
} from "../runtime-state-safety";

function ruleIds(source: string, rules: readonly ReactRule[]): readonly string[] {
  return new ReactEngine().analyze({
    source,
    file: "src/runtime-state.ts",
    plugins: [{
      id: "runtime-state-test",
      name: "Runtime state test",
      version: "1.0.0",
      rules,
    }],
  }).map((finding) => finding.ruleId);
}

describe("React runtime state safety", () => {
  it("detects nullable hydration state dereferenced from the nullable root", () => {
    expect(ruleIds(`
      interface DehydratedState {
        readonly mutations?: readonly unknown[];
      }

      export function hydrateOnClient(state: DehydratedState | null): number {
        return state.mutations?.length ?? 0;
      }
    `, [reactPatternsNullableHydrationStateRule])).toContain(
      "react.patterns.nullable-hydration-state",
    );
  });

  it("accepts a terminating null guard before hydration state access", () => {
    expect(ruleIds(`
      interface DehydratedState {
        readonly mutations?: readonly unknown[];
      }

      export function hydrateOnClient(state: DehydratedState | null): number {
        if (!state) return 0;
        return state.mutations?.length ?? 0;
      }
    `, [reactPatternsNullableHydrationStateRule])).not.toContain(
      "react.patterns.nullable-hydration-state",
    );
  });

  it("accepts optional chaining from the nullable hydration root", () => {
    expect(ruleIds(`
      interface DehydratedState {
        readonly mutations?: readonly unknown[];
      }

      export function hydrateOnClient(state: DehydratedState | null): number {
        return state?.mutations?.length ?? 0;
      }
    `, [reactPatternsNullableHydrationStateRule])).not.toContain(
      "react.patterns.nullable-hydration-state",
    );
  });

  it("detects Object.fromEntries collapsing repeated URLSearchParams in a cache key", () => {
    expect(ruleIds(`
      export function createPageCacheKey(renderedSearch: string): string {
        const query = Object.fromEntries(new URLSearchParams(renderedSearch));
        return \`__PAGE__?\${JSON.stringify(query)}\`;
      }
    `, [reactPatternsSearchParamMultivalueKeyRule])).toContain(
      "react.patterns.search-param-multivalue-key",
    );
  });

  it("does not flag ordinary URLSearchParams parsing outside cache or routing identity", () => {
    expect(ruleIds(`
      export function parseSearch(renderedSearch: string) {
        return Object.fromEntries(new URLSearchParams(renderedSearch));
      }
    `, [reactPatternsSearchParamMultivalueKeyRule])).not.toContain(
      "react.patterns.search-param-multivalue-key",
    );
  });
});
