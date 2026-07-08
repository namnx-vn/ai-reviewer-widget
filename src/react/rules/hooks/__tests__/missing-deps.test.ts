import { describe, expect, it } from "vitest";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactHooksMissingDepsRule } from "../missing-deps";
import type { DependencyHookConfiguration } from "../../../semantic/dependency-hooks";
import { missingDependencyRegression } from "../../__tests__/fixtures";
import { TSESTree } from "@typescript-eslint/typescript-estree";

function check(
  source: string,
  dependencyHooks: readonly DependencyHookConfiguration[] = [],
) {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);

  return reactHooksMissingDepsRule.check(
    findFirstCall(ast),
    {
      source,
      file: "example.tsx",
      ast,
      hooks,
      dependencyHooks,
    },
  );
}

function findFirstCall(
  node: TSESTree.Node,
): TSESTree.CallExpression {
  if (node.type === "CallExpression") {
    return node;
  }

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      const result = findCall(value);

      if (result !== undefined) {
        return result;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isNode(item)) {
          continue;
        }

        const result = findCall(item);

        if (result !== undefined) {
          return result;
        }
      }
    }
  }

  throw new Error("No call expression found");
}

function findCall(
  node: TSESTree.Node,
): TSESTree.CallExpression | undefined {
  if (node.type === "CallExpression") {
    return node;
  }

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      const result = findCall(value);

      if (result !== undefined) {
        return result;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isNode(item)) {
          continue;
        }

        const result = findCall(item);

        if (result !== undefined) {
          return result;
        }
      }
    }
  }

  return undefined;
}

function isNode(
  value: unknown,
): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

describe("react.hooks.missing-deps", () => {
  it("detects missing useEffect dependency", () => {
    const findings = check(missingDependencyRegression);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe(
      "react.hooks.missing-deps",
    );
    expect(findings[0]?.message).toContain(
      "count",
    );
  });

  it("accepts declared useEffect dependency", () => {
    const findings = check(`
      function Counter({ count }) {
        useEffect(() => {
          console.log(count);
        }, [count]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("detects missing useMemo dependency", () => {
    const findings = check(`
      function Component({ value }) {
        const result = useMemo(
          () => value * 2,
          [],
        );

        return result;
      }
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(
      "value",
    );
  });

  it("detects missing useCallback dependency", () => {
    const findings = check(`
      function Component({ value }) {
        const callback = useCallback(
          () => value,
          [],
        );

        return callback;
      }
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(
      "value",
    );
  });

  it("ignores globals", () => {
    const findings = check(`
      function Component() {
        useEffect(() => {
          console.log(Math.random());
        }, []);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report callback-local variables", () => {
    const findings = check(`
      function Component() {
        useEffect(() => {
          const value = 10;
          console.log(value);
        }, []);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("supports member dependencies", () => {
    const findings = check(`
      function Component({ user }) {
        useEffect(() => {
          console.log(user.name);
        }, [user.name]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("ignores hooks without dependency arrays", () => {
    const findings = check(`
      function Component({ value }) {
        useEffect(() => {
          console.log(value);
        });
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("supports explicitly configured custom hooks with dependency arrays", () => {
    const findings = check(
      `
        function Component({ value }) {
          useTrackedEffect(() => console.log(value), []);
        }
      `,
      [{ name: "useTrackedEffect" }],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("value");
  });

  it("does not assume arbitrary custom hooks use dependency arrays", () => {
    const findings = check(`
      function Component({ value }) {
        useTrackedEffect(() => console.log(value), []);
      }
    `);

    expect(findings).toHaveLength(0);
  });
});
