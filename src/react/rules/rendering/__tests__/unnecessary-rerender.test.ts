import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { reactRenderingUnnecessaryRerenderRule } from "../unnecessary-rerender";
import { createHookContext } from "../../../semantic";

function check(source: string) {
  const ast = parseSource(source);
  const calls = findSetterCalls(ast);
  const hooks = createHookContext(ast);

  return calls.flatMap((call) =>
    reactRenderingUnnecessaryRerenderRule.check(call, {
      source,
      file: "example.tsx",
      ast,
      hooks,
    }),
  );
}

function findSetterCalls(node: TSESTree.Node): TSESTree.CallExpression[] {
  const calls: TSESTree.CallExpression[] = [];

  visit(node, (child) => {
    if (
      child.type === "CallExpression" &&
      child.callee.type === "Identifier" &&
      /^set[A-Z0-9]/u.test(child.callee.name)
    ) {
      calls.push(child);
    }
  });

  return calls;
}

function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

function getChildNodes(node: TSESTree.Node): TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        children.push(item);
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

describe("react.rendering.unnecessary-rerender", () => {
  it("detects state update during component render", () => {
    const findings = check(`
      function Component({ value }) {
        const [state, setState] = useState("");

        if (value) {
          setState(value);
        }

        return state;
      }
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.rendering.unnecessary-rerender");
  });

  it("detects unconditional state update during render", () => {
    const findings = check(`
      function Component() {
        const [count, setCount] = useState(0);

        setCount(1);

        return count;
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("detects multiple render-phase state updates", () => {
    const findings = check(`
      function Component({ value }) {
        const [first, setFirst] = useState("");
        const [second, setSecond] = useState("");

        setFirst(value);
        setSecond(value);

        return first + second;
      }
    `);

    expect(findings).toHaveLength(2);
  });

  it("does not report event-handler state updates", () => {
    const findings = check(`
      function Component() {
        const [count, setCount] = useState(0);

        const handleClick = () => {
          setCount((value) => value + 1);
        };

        return <button onClick={handleClick}>{count}</button>;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report effect state updates", () => {
    const findings = check(`
      function Component({ value }) {
        const [state, setState] = useState("");

        useEffect(() => {
          setState(value);
        }, [value]);

        return state;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report non-component functions", () => {
    const findings = check(`
      function calculate(value) {
        setState(value);
        return value;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report nested callback updates", () => {
    const findings = check(`
      function Component() {
        const [count, setCount] = useState(0);

        function update() {
          setCount(1);
        }

        return <button onClick={update}>{count}</button>;
      }
    `);

    expect(findings).toHaveLength(0);
  });
});
