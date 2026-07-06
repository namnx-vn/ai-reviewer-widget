import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactHooksStaleClosureRule } from "../stale-closure";

function check(source: string) {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);
  const hook = findFirstHookCall(ast);

  return reactHooksStaleClosureRule.check(hook, {
    source,
    file: "example.tsx",
    ast,
    hooks,
  });
}

function findFirstHookCall(node: TSESTree.Node): TSESTree.CallExpression {
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    /^use[A-Z0-9]/u.test(node.callee.name)
  ) {
    return node;
  }

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      const result = findHookCall(value);

      if (result !== undefined) {
        return result;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isNode(item)) {
          continue;
        }

        const result = findHookCall(item);

        if (result !== undefined) {
          return result;
        }
      }
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

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      const result = findHookCall(value);

      if (result !== undefined) {
        return result;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isNode(item)) {
          continue;
        }

        const result = findHookCall(item);

        if (result !== undefined) {
          return result;
        }
      }
    }
  }

  return undefined;
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

describe("react.hooks.stale-closure", () => {
  it("detects render value captured by setTimeout", () => {
    const findings = check(`
      function Component({ count }) {
        useEffect(() => {
          setTimeout(() => {
            console.log(count);
          }, 1000);
        }, []);
      }
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.hooks.stale-closure");
  });

  it("detects render value captured by setInterval", () => {
    const findings = check(`
      function Component({ count }) {
        useEffect(() => {
          setInterval(() => {
            console.log(count);
          }, 1000);
        }, []);
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("detects render value captured by Promise.then", () => {
    const findings = check(`
      function Component({ userId }) {
        useEffect(() => {
          Promise.resolve().then(() => {
            console.log(userId);
          });
        }, []);
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("detects async callback capture", () => {
    const findings = check(`
      function Component({ query }) {
        useEffect(() => {
          const run = async () => {
            await Promise.resolve();
            console.log(query);
          };

          run();
        }, []);
      }
    `);

    expect(findings).toHaveLength(1);
  });

  it("does not report synchronous callback", () => {
    const findings = check(`
      function Component({ count }) {
        useEffect(() => {
          [count].forEach((value) => {
            console.log(value);
          });
        }, [count]);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report callback-local values", () => {
    const findings = check(`
      function Component() {
        useEffect(() => {
          setTimeout(() => {
            const value = 1;
            console.log(value);
          }, 1000);
        }, []);
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not report functional state updater parameter", () => {
  const findings = check(`
    function Component() {
      const [, setCount] = useState(0);

      useEffect(() => {
        setTimeout(() => {
          setCount((previous) => previous + 1);
        }, 1000);
      }, []);
    }
  `);

  expect(findings).toHaveLength(0);
});

  it("detects multiple captured render values", () => {
    const findings = check(`
      function Component({ count, name }) {
        useEffect(() => {
          setTimeout(() => {
            console.log(count, name);
          }, 1000);
        }, []);
      }
    `);

    expect(findings).toHaveLength(2);
  });
});
