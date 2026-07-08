import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactRenderingUnstablePropsRule } from "../unstable-props";

function check(source: string) {
    const ast = parseSource(source);
    const hooks = createHookContext(ast);

    return findOpeningElements(ast).flatMap((node) =>
        reactRenderingUnstablePropsRule.check(node, {
            source,
            file: "example.tsx",
            ast,
            hooks,
        }),
    );
}

function findOpeningElements(
    node: TSESTree.Node,
): TSESTree.JSXOpeningElement[] {
    const result: TSESTree.JSXOpeningElement[] = [];

    visit(node, (child) => {
        if (child.type === "JSXOpeningElement") {
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

describe("react.rendering.unstable-props", () => {
    it("detects inline object props", () => {
        const findings = check(`
      function Parent() {
        return (
          <Child
            style={{ color: "red" }}
          />
        );
      }
    `);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.ruleId).toBe(
            "react.rendering.unstable-props",
        );
        expect(findings[0]?.message).toContain(
            'object prop "style"',
        );
    });

    it("detects inline array props", () => {
        const findings = check(`
      function Parent() {
        return (
          <Child
            items={[1, 2, 3]}
          />
        );
      }
    `);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.message).toContain(
            'array prop "items"',
        );
    });

    it("detects inline function props", () => {
        const findings = check(`
      function Parent() {
        return (
          <Child
            onSave={() => save()}
          />
        );
      }
    `);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.message).toContain(
            'function prop "onSave"',
        );
    });

    it("detects inline function expression props", () => {
        const findings = check(`
      function Parent() {
        return (
          <Child
            onSave={function save() {}}
          />
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("detects multiple unstable props", () => {
        const findings = check(`
      function Parent() {
        return (
          <Child
            style={{ color: "red" }}
            items={[1, 2, 3]}
            onSave={() => save()}
          />
        );
      }
    `);

        expect(findings).toHaveLength(3);
    });

    it("does not report primitive props", () => {
        const findings = check(`
      function Parent({ count }) {
        return (
          <Child
            count={count}
            title="Hello"
            enabled={true}
          />
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report identifier props", () => {
        const findings = check(`
      function Parent({ style, items, onSave }) {
        return (
          <Child
            style={style}
            items={items}
            onSave={onSave}
          />
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report memoized values", () => {
        const findings = check(`
      function Parent() {
        const style = useMemo(
          () => ({ color: "red" }),
          [],
        );

        const items = useMemo(
          () => [1, 2, 3],
          [],
        );

        const onSave = useCallback(
          () => save(),
          [],
        );

        return (
          <Child
            style={style}
            items={items}
            onSave={onSave}
          />
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report intrinsic DOM elements", () => {
        const findings = check(`
      function Parent() {
        return (
          <button
            style={{ color: "red" }}
            onClick={() => save()}
          />
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report lowercase intrinsic elements", () => {
        const findings = check(`
      function Parent() {
        return (
          <div
            data-config={{ value: 1 }}
          />
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("detects member-expression components", () => {
        const findings = check(`
      function Parent() {
        return (
          <UI.Child
            config={{ enabled: true }}
          />
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("does not report spread props", () => {
        const findings = check(`
      function Parent({ props }) {
        return <Child {...props} />;
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report boolean JSX props", () => {
        const findings = check(`
      function Parent() {
        return <Child enabled />;
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("detects several props independently", () => {
        const findings = check(`
      function Parent() {
        return (
          <Child
            a={{ value: 1 }}
            b="value"
            c={42}
            d={[]}
            e={() => null}
          />
        );
      }
    `);

        expect(findings).toHaveLength(3);
    });
});