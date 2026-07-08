import { describe, expect, it } from "vitest";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactRenderingKeyMisuseRule } from "../key-misuse";

function check(source: string) {
    const ast = parseSource(source);
    const hooks = createHookContext(ast);

    return findOpeningElements(ast).flatMap((node) =>
        reactRenderingKeyMisuseRule.check(node, {
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

describe("react.rendering.key-misuse", () => {
    it("detects missing key in map", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map(item => (
              <Row item={item} />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.ruleId).toBe(
            "react.rendering.key-misuse",
        );
    });

    it("allows stable item id", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map(item => (
              <Row
                key={item.id}
                item={item}
              />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("detects index key", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map((item, index) => (
              <Row
                key={index}
                item={item}
              />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("detects i as index key", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map((item, i) => (
              <Row
                key={i}
                item={item}
              />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("detects Math.random key", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map(item => (
              <Row
                key={Math.random()}
                item={item}
              />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("detects uuid key", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map(item => (
              <Row
                key={uuid()}
                item={item}
              />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("detects nanoid key", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map(item => (
              <Row
                key={nanoid()}
                item={item}
              />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(1);
    });

    it("allows stable key variable", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map(item => {
              const key = item.id;

              return (
                <Row
                  key={key}
                  item={item}
                />
              );
            })}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report JSX outside map", () => {
        const findings = check(`
      function Page() {
        return <Row />;
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("does not report stable primitive key", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map(item => (
              <Row
                key={item.slug}
                item={item}
              />
            ))}
          </div>
        );
      }
    `);

        expect(findings).toHaveLength(0);
    });

    it("detects multiple broken list items", () => {
        const findings = check(`
      function List({ items }) {
        return (
          <div>
            {items.map((item, index) => (
              <>
                <Row item={item} />
                <OtherRow key={index} />
              </>
            ))}
          </div>
        );
      }
    `);

        expect(findings.length).toBeGreaterThanOrEqual(1);
    });
});