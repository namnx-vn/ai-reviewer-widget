import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactHooksInvalidOrderRule } from "../invalid-order";

function check(source: string) {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);
  const hook = findFirstHookCall(ast);

  return reactHooksInvalidOrderRule.check(hook, {
    source,
    file: "example.tsx",
    ast,
    hooks,
  });
}

function findFirstHookCall(
  node: TSESTree.Node,
): TSESTree.CallExpression {
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    /^use[A-Z0-9]/u.test(node.callee.name)
  ) {
    return node;
  }

  for (const child of getChildNodes(node)) {
    const result = findHookCall(child);

    if (result !== undefined) {
      return result;
    }
  }

  throw new Error("No Hook call found");
}

function findHookCall(
  node: TSESTree.Node,
): TSESTree.CallExpression | undefined {
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    /^use[A-Z0-9]/u.test(node.callee.name)
  ) {
    return node;
  }

  for (const child of getChildNodes(node)) {
    const result = findHookCall(child);

    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function getChildNodes(node: TSESTree.Node): TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    }
  }

  return children;
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

describe("react.hooks.invalid-order", () => {
  it("detects Hook at module scope", () => {
    expect(
      check(`
        useEffect(() => {}, []);
      `),
    ).toHaveLength(1);
  });

  it("detects Hook inside ordinary nested function", () => {
    expect(
      check(`
        function Component() {
          function helper() {
            useEffect(() => {}, []);
          }

          return null;
        }
      `),
    ).toHaveLength(1);
  });

  it("detects Hook inside nested callback", () => {
    expect(
      check(`
        function Component() {
          const helper = () => {
            useEffect(() => {}, []);
          };

          return null;
        }
      `),
    ).toHaveLength(1);
  });

  it("allows Hook in component", () => {
    expect(
      check(`
        function Component() {
          useEffect(() => {}, []);
          return null;
        }
      `),
    ).toHaveLength(1);
  });

  it("allows Hook in custom Hook", () => {
    expect(
      check(`
        function useValue() {
          const value = useMemo(() => 1, []);
          return value;
        }
      `),
    ).toHaveLength(0);
  });
});