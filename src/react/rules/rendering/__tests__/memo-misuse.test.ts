import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { memoWithoutPropsRegression } from "../../__tests__/fixtures";
import { reactRenderingMemoMisuseRule } from "../memo-misuse";

function check(source: string) {
    const ast = parseSource(source);

    return findMemoCalls(ast).flatMap((call) =>
        reactRenderingMemoMisuseRule.check(call, {
            source,
            file: "example.tsx",
            ast,
            hooks: createHookContext(ast),
        }),
    );
}

function findMemoCalls(
    node: TSESTree.Node,
): TSESTree.CallExpression[] {
    const result: TSESTree.CallExpression[] = [];

    visit(node, (child) => {
        if (
            child.type !== "CallExpression"
        ) {
            return;
        }

        if (
            child.callee.type === "Identifier" &&
            child.callee.name === "memo"
        ) {
            result.push(child);
            return;
        }

        if (
            child.callee.type === "MemberExpression" &&
            child.callee.object.type === "Identifier" &&
            child.callee.object.name === "React" &&
            child.callee.property.type === "Identifier" &&
            child.callee.property.name === "memo"
        ) {
            result.push(child);
        }
    });

    return result;
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

describe("react.rendering.memo-misuse", () => {
    it("detects memo without props", () => {
        const findings = check(memoWithoutPropsRegression);

        expect(findings).toHaveLength(1);
    });

    it("detects React.memo without props", () => {
        const findings = check(`
      const A = React.memo(() => {
        return <div />;
      });
    `);

        expect(findings).toHaveLength(1);
    });

    it("detects comparator returning true", () => {
        const findings = check(`
      const A = memo(
        ({value}) => <div>{value}</div>,
        () => true
      );
    `);

        expect(findings).toHaveLength(1);
    });

    it("allows memoized component with props", () => {
        const findings = check(`
      const A = memo(({value}) => {
        return <div>{value}</div>;
      });
    `);

        expect(findings).toHaveLength(0);
    });

    it("allows useful comparator", () => {
        const findings = check(`
      const A = memo(
        ({value}) => <div>{value}</div>,
        (a,b)=>a.value===b.value
      );
    `);

        expect(findings).toHaveLength(0);
    });
});
