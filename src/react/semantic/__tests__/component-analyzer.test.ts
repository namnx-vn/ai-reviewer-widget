import {
  describe,
  expect,
  it,
} from "vitest";
import { parseSource } from "../../../analyzer/ast/parser";
import {
  analyzeComponents,
} from "../component-analyzer";

function analyze(
  source: string,
) {
  const ast = parseSource(source);

  return analyzeComponents(ast);
}

describe(
  "analyzeComponents",
  () => {
    it(
      "detects function components",
      () => {
        const result = analyze(`
          function Button() {
            return <button>Click</button>;
          }
        `);

        expect(
          result.components,
        ).toHaveLength(1);

        expect(
          result.components[0],
        ).toMatchObject({
          name: "Button",
          kind: "function",
          hasJsx: true,
        });
      },
    );

    it(
      "detects arrow function components",
      () => {
        const result = analyze(`
          const Button = () => (
            <button>Click</button>
          );
        `);

        expect(
          result.components,
        ).toHaveLength(1);

        expect(
          result.components[0],
        ).toMatchObject({
          name: "Button",
          kind: "arrow",
          hasJsx: true,
        });
      },
    );

    it(
      "detects memo components",
      () => {
        const result = analyze(`
          const Button = memo(
            function ButtonComponent() {
              return <button>Click</button>;
            },
          );
        `);

        expect(
          result.components,
        ).toHaveLength(1);

        expect(
          result.components[0],
        ).toMatchObject({
          name: "Button",
          kind: "memo",
          hasJsx: true,
        });
      },
    );

    it(
      "detects forwardRef components",
      () => {
        const result = analyze(`
          const Input = forwardRef(
            function InputComponent() {
              return <input />;
            },
          );
        `);

        expect(
          result.components,
        ).toHaveLength(1);

        expect(
          result.components[0],
        ).toMatchObject({
          name: "Input",
          kind: "forwardRef",
          hasJsx: true,
        });
      },
    );

    it(
      "does not classify lowercase functions as components",
      () => {
        const result = analyze(`
          function renderButton() {
            return <button>Click</button>;
          }
        `);

        expect(
          result.components,
        ).toHaveLength(0);
      },
    );

    it(
      "does not classify ordinary PascalCase functions without JSX",
      () => {
        const result = analyze(`
          function Button() {
            return "button";
          }
        `);

        expect(
          result.components,
        ).toHaveLength(0);
      },
    );

    it(
      "does not classify lowercase arrow functions as components",
      () => {
        const result = analyze(`
          const renderButton = () => (
            <button>Click</button>
          );
        `);

        expect(
          result.components,
        ).toHaveLength(0);
      },
    );

    it(
      "preserves source location",
      () => {
        const result = analyze(`
          
          
          function Button() {
            return <button />;
          }
        `);

        expect(
          result.components[0]?.location,
        ).toEqual({
          line: 4,
          column: 10,
        });
      },
    );

    it(
      "detects multiple components",
      () => {
        const result = analyze(`
          function Header() {
            return <header />;
          }

          const Footer = () => (
            <footer />
          );
        `);

        expect(
          result.components.map(
            (component) => component.name,
          ),
        ).toEqual([
          "Header",
          "Footer",
        ]);
      },
    );

    it(
      "does not duplicate a component candidate",
      () => {
        const result = analyze(`
          const Button = () => (
            <button />
          );
        `);

        expect(
          result.components.filter(
            (component) =>
              component.name === "Button",
          ),
        ).toHaveLength(1);
      },
    );
  },
);