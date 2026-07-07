import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactHooksUnnecessaryEffectRule } from "../unnecessary-effect";

function check(source: string) {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);
  const hook = findFirstHookCall(ast);

  return reactHooksUnnecessaryEffectRule.check(hook, {
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
    throw new Error("No Hook call found");
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

describe("react.hooks.unnecessary-effect", () => {
  it("detects derived string state", () => {
    const findings = check(`
      function Component({ firstName, lastName }) {
        const [fullName, setFullName] = useState("");

        useEffect(() => {
          setFullName(firstName + " " + lastName);
        }, [firstName, lastName]);

        return fullName;
      }
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe(
      "react.hooks.unnecessary-effect",
    );
  });

  it("detects synchronous numeric calculation", () => {
    const findings = check(`
      function Component({ price, quantity }) {
        const [total, setTotal] = useState(0);

        useEffect(() => {
          setTotal(price * quantity);
        }, [price, quantity]);

        return total;
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("detects derived array state", () => {
    const findings = check(`
      function Component({ items }) {
        const [visibleItems, setVisibleItems] = useState([]);

        useEffect(() => {
          setVisibleItems(items.filter(Boolean));
        }, [items]);

        return visibleItems;
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("detects synchronous local calculation before setter", () => {
    const findings = check(`
      function Component({ price, quantity }) {
        const [total, setTotal] = useState(0);

        useEffect(() => {
          const nextTotal = price * quantity;
          setTotal(nextTotal);
        }, [price, quantity]);

        return total;
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("does not report document synchronization", () => {
    const findings = check(`
      function Component({ title }) {
        useEffect(() => {
          document.title = title;
        }, [title]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report fetch effect", () => {
    const findings = check(`
      function Component({ id }) {
        useEffect(() => {
          fetch("/api/items/" + id);
        }, [id]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report subscription effect", () => {
    const findings = check(`
      function Component({ source }) {
        useEffect(() => {
          const unsubscribe = source.subscribe(() => {});
          return unsubscribe;
        }, [source]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report functional state update", () => {
    const findings = check(`
      function Component() {
        const [count, setCount] = useState(0);

        useEffect(() => {
          setCount((previous) => previous + 1);
        }, []);

        return count;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report unknown function calls", () => {
    const findings = check(`
      function Component({ value }) {
        useEffect(() => {
          doSomething(value);
        }, [value]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report cleanup effects", () => {
    const findings = check(`
      function Component({ source }) {
        useEffect(() => {
          source.connect();

          return () => {
            source.disconnect();
          };
        }, [source]);
      }
    `);

    expect(findings).toHaveLength(0);
  });
});