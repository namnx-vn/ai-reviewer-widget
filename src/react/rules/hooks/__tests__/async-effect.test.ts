import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactHooksAsyncEffectRule } from "../async-effect";

function check(source: string) {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);
  const hook = findFirstHookCall(ast);

  return reactHooksAsyncEffectRule.check(hook, {
    source,
    file: "example.tsx",
    ast,
    hooks,
  });
}

function findFirstHookCall(
  node: TSESTree.Node,
): TSESTree.CallExpression {
  const result = findHookCall(node);

  if (result === undefined) {
    throw new Error("No useEffect call found");
  }

  return result;
}

function findHookCall(
  node: TSESTree.Node,
): TSESTree.CallExpression | undefined {
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "useEffect"
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

function getChildNodes(
  node: TSESTree.Node,
): TSESTree.Node[] {
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

describe("react.hooks.async-effect", () => {
  it("detects async effect callback", () => {
    const findings = check(`
      function Component() {
        useEffect(async () => {
          await fetch("/api/items");
        }, []);
      }
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe(
      "react.hooks.async-effect",
    );
  });

  it("detects fetch without cancellation", () => {
    const findings = check(`
      function Component({ id }) {
        useEffect(() => {
          fetch("/api/items/" + id).then((response) => {
            setData(response);
          });
        }, [id]);
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("detects async state update without cleanup", () => {
    const findings = check(`
      function Component({ id }) {
        useEffect(() => {
          fetch("/api/items/" + id)
            .then((response) => response.json())
            .then((data) => {
              setData(data);
            });
        }, [id]);
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("allows fetch with AbortController cleanup", () => {
    const findings = check(`
      function Component({ id }) {
        useEffect(() => {
          const controller = new AbortController();

          fetch("/api/items/" + id, {
            signal: controller.signal,
          }).then((response) => {
            setData(response);
          });

          return () => controller.abort();
        }, [id]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("allows synchronous effect", () => {
    const findings = check(`
      function Component({ title }) {
        useEffect(() => {
          document.title = title;
        }, [title]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("allows effect with cleanup", () => {
    const findings = check(`
      function Component({ source }) {
        useEffect(() => {
          const unsubscribe = source.subscribe(() => {
            setValue(1);
          });

          return () => unsubscribe();
        }, [source]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report non-effect async callback", () => {
    const findings = check(`
      function Component() {
        useEffect(() => {
          const run = async () => {
            await Promise.resolve();
          };

          run();
        }, []);
      }
    `);

    expect(findings).toHaveLength(0);
  });
});