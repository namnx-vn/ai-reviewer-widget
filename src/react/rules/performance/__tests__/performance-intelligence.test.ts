import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { describe, expect, it } from "vitest";

import { parseSource } from "../../../../analyzer/ast/parser";
import type { ReviewFinding } from "../../../../review/types";
import type { ReactRule } from "../../../engine/react-rule";
import { createHookContext } from "../../../semantic";
import {
  reactPerformanceExpensiveRenderWorkRule,
  reactPerformanceRepeatedDerivedComputationRule,
  reactPerformanceRenderTimeConstructionRule,
  reactPerformanceTrivialUseMemoRule,
  reactPerformanceUnboundedListRenderRule,
} from "..";

function check(source: string, rule: ReactRule): ReviewFinding[] {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);
  const findings: ReviewFinding[] = [];

  visit(ast, (node) => {
    findings.push(
      ...rule.check(node, {
        source,
        file: "example.tsx",
        ast,
        hooks,
      }),
    );
  });

  return findings;
}

function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, callback);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        visit(item, callback);
      }
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

describe("React performance intelligence", () => {
  it("detects render-time sorting of a dynamic collection", () => {
    const findings = check(`
      function List({ items }) {
        const sorted = items.toSorted((left, right) => left.name.localeCompare(right.name));
        return <ul>{sorted.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
      }
    `, reactPerformanceExpensiveRenderWorkRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.performance.expensive-render-work");
  });

  it("detects three collection passes in one render-time derivation", () => {
    const findings = check(`
      function Summary({ items }) {
        const total = items
          .filter((item) => item.active)
          .map((item) => item.value)
          .reduce((sum, value) => sum + value, 0);
        return <strong>{total}</strong>;
      }
    `, reactPerformanceExpensiveRenderWorkRule);

    expect(findings).toHaveLength(1);
  });

  it("does not report expensive collection work already isolated in useMemo", () => {
    const findings = check(`
      function List({ items }) {
        const sorted = useMemo(
          () => items.toSorted((left, right) => left.name.localeCompare(right.name)),
          [items],
        );
        return <ul>{sorted.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
      }
    `, reactPerformanceExpensiveRenderWorkRule);

    expect(findings).toHaveLength(0);
  });

  it("detects JSX mapping over an unbounded dynamic collection", () => {
    const findings = check(`
      function List({ items }) {
        return <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
      }
    `, reactPerformanceUnboundedListRenderRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.performance.unbounded-list-render");
  });

  it("does not report a statically bounded list render", () => {
    const findings = check(`
      function List({ items }) {
        return <ul>{items.slice(0, 50).map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
      }
    `, reactPerformanceUnboundedListRenderRule);

    expect(findings).toHaveLength(0);
  });

  it("detects useMemo around a trivial expression", () => {
    const findings = check(`
      function Counter({ count }) {
        const nextCount = useMemo(() => count + 1, [count]);
        return <span>{nextCount}</span>;
      }
    `, reactPerformanceTrivialUseMemoRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.performance.trivial-use-memo");
  });

  it("does not report useMemo that preserves object identity", () => {
    const findings = check(`
      function Counter({ count }) {
        const model = useMemo(() => ({ count }), [count]);
        return <Child model={model} />;
      }
    `, reactPerformanceTrivialUseMemoRule);

    expect(findings).toHaveLength(0);
  });

  it("detects identical dynamic collection derivations repeated in one render", () => {
    const findings = check(`
      function List({ items }) {
        const visible = items.filter((item) => item.active);
        const active = items.filter((item) => item.active);
        return <span>{visible.length + active.length}</span>;
      }
    `, reactPerformanceRepeatedDerivedComputationRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.performance.repeated-derived-computation");
  });

  it("does not report a derived collection computed once", () => {
    const findings = check(`
      function List({ items }) {
        const visible = items.filter((item) => item.active);
        return <span>{visible.length}</span>;
      }
    `, reactPerformanceRepeatedDerivedComputationRule);

    expect(findings).toHaveLength(0);
  });

  it("detects Intl formatter construction during render", () => {
    const findings = check(`
      function Price({ value }) {
        const formatter = new Intl.NumberFormat("en-US");
        return <span>{formatter.format(value)}</span>;
      }
    `, reactPerformanceRenderTimeConstructionRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.performance.render-time-construction");
  });

  it("does not report a formatter constructed outside the component", () => {
    const findings = check(`
      const formatter = new Intl.NumberFormat("en-US");
      function Price({ value }) {
        return <span>{formatter.format(value)}</span>;
      }
    `, reactPerformanceRenderTimeConstructionRule);

    expect(findings).toHaveLength(0);
  });

  it("does not report dynamic RegExp construction without enough static evidence", () => {
    const findings = check(`
      function Search({ pattern, value }) {
        const expression = new RegExp(pattern);
        return <span>{String(expression.test(value))}</span>;
      }
    `, reactPerformanceRenderTimeConstructionRule);

    expect(findings).toHaveLength(0);
  });

  it("does not report construction deferred to an event handler", () => {
    const findings = check(`
      function Search({ value }) {
        const handleClick = () => {
          const expression = new RegExp("^value$");
          return expression.test(value);
        };
        return <button onClick={handleClick}>Search</button>;
      }
    `, reactPerformanceRenderTimeConstructionRule);

    expect(findings).toHaveLength(0);
  });
});
