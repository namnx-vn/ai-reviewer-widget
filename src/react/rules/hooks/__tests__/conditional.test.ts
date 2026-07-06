import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactHooksConditionalRule } from "../conditional";

function check(source: string) {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);
  const hook = findFirstHookCall(ast);

  return reactHooksConditionalRule.check(hook, {
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
    const result = findFirstHookCallSafe(child);

    if (result !== undefined) {
      return result;
    }
  }

  throw new Error("No Hook call found");
}

function findFirstHookCallSafe(
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
    const result = findFirstHookCallSafe(child);

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

describe("react.hooks.conditional", () => {
  it("detects Hook inside if", () => {
    expect(
      check(`
        function Component({ enabled }) {
          if (enabled) {
            useEffect(() => {}, []);
          }
        }
      `),
    ).toHaveLength(1);
  });

  it("detects Hook inside ternary", () => {
    expect(
      check(`
        function Component({ enabled }) {
          enabled
            ? useMemo(() => 1, [])
            : null;
        }
      `),
    ).toHaveLength(1);
  });

  it("detects Hook inside logical expression", () => {
    expect(
      check(`
        function Component({ enabled }) {
          enabled && useEffect(() => {}, []);
        }
      `),
    ).toHaveLength(1);
  });

  it("detects Hook inside for loop", () => {
    expect(
      check(`
        function Component() {
          for (let index = 0; index < 1; index += 1) {
            useEffect(() => {}, []);
          }
        }
      `),
    ).toHaveLength(1);
  });

  it("detects Hook inside while loop", () => {
    expect(
      check(`
        function Component() {
          while (true) {
            useEffect(() => {}, []);
            break;
          }
        }
      `),
    ).toHaveLength(1);
  });

  it("detects Hook after early return", () => {
    expect(
      check(`
        function Component({ enabled }) {
          if (!enabled) {
            return null;
          }

          useEffect(() => {}, []);
        }
      `),
    ).toHaveLength(1);
  });

  it("does not flag top-level Hook", () => {
    expect(
      check(`
        function Component() {
          useEffect(() => {}, []);
          return null;
        }
      `),
    ).toHaveLength(0);
  });

  it("does not flag return inside a later branch", () => {
    expect(
      check(`
        function Component({ enabled }) {
          useEffect(() => {}, []);

          if (enabled) {
            return null;
          }

          return null;
        }
      `),
    ).toHaveLength(0);
  });
});