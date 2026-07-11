import { describe, expect, it } from "vitest";

import { reactPlugin } from "../react-plugin";
import { ReactEngine } from "../../engine/react-engine";

describe("reactPlugin", () => {
  it("registers hooks, rendering, state, performance, context, and patterns intelligence rules", () => {
    const ruleIds = reactPlugin.rules.map((rule) => rule.id);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "react.hooks.missing-deps",
        "react.hooks.stale-closure",
        "react.hooks.conditional",
        "react.hooks.invalid-order",
        "react.hooks.unnecessary-effect",
        "react.hooks.async-effect",
        "react.rendering.callback-misuse",
        "react.rendering.key-misuse",
        "react.rendering.unnecessary-rerender",
        "react.rendering.unstable-props",
        "react.rendering.memo-misuse",
        "react.rendering.memo-boundary",
        "react.state.mutation",
        "react.state.derived-state",
        "react.state.redundant-state",
        "react.state.synchronization",
        "react.performance.expensive-render-work",
        "react.performance.unbounded-list-render",
        "react.performance.trivial-use-memo",
        "react.performance.repeated-derived-computation",
        "react.performance.render-time-construction",
        "react.context.unstable-value",
        "react.context.consumer-invalidation",
        "react.context.provider-nesting",
        "react.patterns.query-key-stability",
        "react.patterns.query-effect-sync",
        "react.patterns.query-cache-invalidation-render",
        "react.patterns.mutation-in-render",
        "react.patterns.suspense-fallback",
        "react.patterns.ineffective-error-boundary",
        "react.patterns.nested-component-definition",
      ]),
    );
  });

  it("does not register duplicate rule ids", () => {
    const ruleIds = reactPlugin.rules.map((rule) => rule.id);

    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it("runs rendering rules through the default plugin", () => {
    const findings = new ReactEngine().analyze({
      source: "const StaticCard = memo(() => <div>static</div>);",
      file: "StaticCard.tsx",
      plugins: [reactPlugin],
    });

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.rendering.memo-misuse",
    );
  });

  it("runs performance rules through the default plugin", () => {
    const findings = new ReactEngine().analyze({
      source: `
        function Counter({ count }) {
          const nextCount = useMemo(() => count + 1, [count]);
          return <span>{nextCount}</span>;
        }
      `,
      file: "Counter.tsx",
      plugins: [reactPlugin],
    });

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.performance.trivial-use-memo",
    );
  });

  it("runs context rules through the default plugin", () => {
    const findings = new ReactEngine().analyze({
      source: `
        const ThemeContext = createContext(null);
        function App({ theme }) {
          return <ThemeContext.Provider value={{ theme }}><Page /></ThemeContext.Provider>;
        }
      `,
      file: "App.tsx",
      plugins: [reactPlugin],
    });

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.context.unstable-value",
    );
  });

  it("runs patterns rules through the default plugin", () => {
    const findings = new ReactEngine().analyze({
      source: `
        function List({ items }) {
          function Row({ item }) {
            return <span>{item.name}</span>;
          }
          return <div>{items.map((item) => <Row key={item.id} item={item} />)}</div>;
        }
      `,
      file: "List.tsx",
      plugins: [reactPlugin],
    });

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.patterns.nested-component-definition",
    );
  });
});
