import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactRenderingCallbackMisuseRule } from "../callback-misuse";

function check(source: string) {
    const ast = parseSource(source);
    const hooks = createHookContext(ast);

    return findUseCallbackCalls(ast).flatMap((call) =>
        reactRenderingCallbackMisuseRule.check(call, {
            source,
            file: "example.tsx",
            ast,
            hooks,
        }),
    );
}

function findUseCallbackCalls(
    node: TSESTree.Node,
): TSESTree.CallExpression[] {
    const calls: TSESTree.CallExpression[] = [];

    visit(node, (child) => {
        if (
            child.type === "CallExpression" &&
            isUseCallbackCall(child)
        ) {
            calls.push(child);
        }
    });

    return calls;
}

function isUseCallbackCall(
    node: TSESTree.CallExpression,
): boolean {
    if (
        node.callee.type === "Identifier" &&
        node.callee.name === "useCallback"
    ) {
        return true;
    }

    return (
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "React" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "useCallback"
    );
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

function getChildNodes(
    node: TSESTree.Node,
): TSESTree.Node[] {
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

describe("react.rendering.callback-misuse", () => {
    it("detects unused useCallback", () => {
        const findings = check(`
      function Component() {
        const handleClick = useCallback(() => {
          console.log("click");
        }, []);

        return <div />;
      }
    `);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.ruleId).toBe(
            "react.rendering.callback-misuse",
        );
    });

    it("detects useCallback used only by intrinsic DOM event", () => {
        const findings = check(`
      function Component() {
        const handleClick = useCallback(() => {
          console.log("click");
        }, []);

        return (
          <button onClick={handleClick}>
            Click
          </button>
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("detects useCallback used only for direct invocation", () => {
        const findings = check(`
      function Component({ enabled }) {
        const calculate = useCallback(() => {
          return 42;
        }, []);

        const value = enabled
          ? calculate()
          : 0;

        return <div>{value}</div>;
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("does not report callback passed to React component", () => {
        const findings = check(`
      function Component() {
        const handleSave = useCallback(() => {
          console.log("save");
        }, []);

        return <Editor onSave={handleSave} />;
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report callback used as Hook dependency", () => {
        const findings = check(`
      function Component() {
        const loadData = useCallback(() => {
          fetch("/api/data");
        }, []);

        useEffect(() => {
          loadData();
        }, [loadData]);

        return <div />;
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report callback passed to external API", () => {
        const findings = check(`
      function Component() {
        const listener = useCallback(() => {
          console.log("resize");
        }, []);

        subscribe(listener);

        return <div />;
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report callback stored inside object", () => {
        const findings = check(`
      function Component() {
        const handleSave = useCallback(() => {
          console.log("save");
        }, []);

        const actions = {
          save: handleSave,
        };

        return <Toolbar actions={actions} />;
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("supports React.useCallback", () => {
        const findings = check(`
      function Component() {
        const handleClick = React.useCallback(() => {
          console.log("click");
        }, []);

        return <button onClick={handleClick}>Click</button>;
      }
    `);

        expect(findings).toHaveLength(1);
    });
});