import {
  describe,
  expect,
  it,
} from "vitest";
import { parseSource } from "../../../src/analyzer/ast/parser";
import {
  analyzeJSX,
} from "../../../src/react/semantic/jsx-analyzer";

function analyze(
  source: string,
) {
  return analyzeJSX(
    parseSource(source),
  );
}

describe(
  "analyzeJSX",
  () => {
    it(
      "detects intrinsic elements",
      () => {
        const result = analyze(`
          function App() {
            return (
              <div>
                <span>Hello</span>
              </div>
            );
          }
        `);

        expect(
          result.elements.map(
            (element) => ({
              name: element.name,
              kind: element.kind,
            }),
          ),
        ).toEqual([
          {
            name: "div",
            kind: "intrinsic",
          },
          {
            name: "span",
            kind: "intrinsic",
          },
        ]);
      },
    );

    it(
      "detects component elements",
      () => {
        const result = analyze(`
          function App() {
            return (
              <UserCard />
            );
          }
        `);

        expect(
          result.elements[0],
        ).toMatchObject({
          name: "UserCard",
          kind: "component",
        });
      },
    );

    it(
      "detects member expression component names",
      () => {
        const result = analyze(`
          function App() {
            return (
              <UI.Button />
            );
          }
        `);

        expect(
          result.elements[0],
        ).toMatchObject({
          name: "UI.Button",
          kind: "component",
        });
      },
    );

    it(
      "detects fragments",
      () => {
        const result = analyze(`
          function App() {
            return (
              <>
                <div />
                <span />
              </>
            );
          }
        `);

        expect(
          result.fragments,
        ).toHaveLength(1);

        expect(
          result.fragments[0],
        ).toMatchObject({
          childCount: 2,
          hasChildren: true,
        });
      },
    );

    it(
      "detects JSX attributes",
      () => {
        const result = analyze(`
          function App() {
            return (
              <Button
                disabled
                title="Hello"
                count={42}
              />
            );
          }
        `);

        expect(
          result.elements[0]?.attributes,
        ).toHaveLength(3);

        expect(
          result.elements[0]?.attributes.map(
            (attribute) => ({
              name: attribute.name,
              isSpread: attribute.isSpread,
              hasValue: attribute.hasValue,
            }),
          ),
        ).toEqual([
          {
            name: "disabled",
            isSpread: false,
            hasValue: false,
          },
          {
            name: "title",
            isSpread: false,
            hasValue: true,
          },
          {
            name: "count",
            isSpread: false,
            hasValue: true,
          },
        ]);
      },
    );

    it(
      "detects spread attributes",
      () => {
        const result = analyze(`
          function App() {
            return (
              <Button {...props} />
            );
          }
        `);

        expect(
          result.elements[0]?.attributes,
        ).toEqual([
          expect.objectContaining({
            isSpread: true,
            hasValue: true,
          }),
        ]);
      },
    );

    it(
      "detects event handlers",
      () => {
        const result = analyze(`
          function App() {
            return (
              <button
                onClick={handleClick}
                onMouseEnter={handleEnter}
                disabled
              />
            );
          }
        `);

        expect(
          result.elements[0]?.eventHandlers,
        ).toEqual([
          "onClick",
          "onMouseEnter",
        ]);
      },
    );

    it(
      "detects key attributes",
      () => {
        const result = analyze(`
          function App() {
            return (
              <Item key={item.id} />
            );
          }
        `);

        expect(
          result.elements[0]?.hasKey,
        ).toBe(true);
      },
    );

    it(
      "detects missing key attributes",
      () => {
        const result = analyze(`
          function App() {
            return (
              <Item value={item.id} />
            );
          }
        `);

        expect(
          result.elements[0]?.hasKey,
        ).toBe(false);
      },
    );

    it(
      "tracks children",
      () => {
        const result = analyze(`
          function App() {
            return (
              <div>
                Hello
                <span />
                {value}
              </div>
            );
          }
        `);

        expect(
          result.elements.find(
            (element) =>
              element.name === "div",
          ),
        ).toMatchObject({
          childCount: 3,
          hasChildren: true,
        });
      },
    );

    it(
      "detects self-closing elements",
      () => {
        const result = analyze(`
          function App() {
            return <Input />;
          }
        `);

        expect(
          result.elements[0],
        ).toMatchObject({
          name: "Input",
          hasChildren: false,
          childCount: 0,
        });
      },
    );

    it(
      "preserves source locations",
      () => {
        const result = analyze(`
          function App() {
            return (
              <Button />
            );
          }
        `);

        expect(
          result.elements[0]?.location,
        ).toEqual({
          line: 4,
          column: 14,
        });
      },
    );

    it(
      "analyzes nested JSX elements",
      () => {
        const result = analyze(`
          function App() {
            return (
              <Layout>
                <Header />
                <Content>
                  <Button />
                </Content>
              </Layout>
            );
          }
        `);

        expect(
          result.elements.map(
            (element) => element.name,
          ),
        ).toEqual([
          "Layout",
          "Header",
          "Content",
          "Button",
        ]);
      },
    );

    it(
      "handles multiple fragments",
      () => {
        const result = analyze(`
          const First = () => (
            <>
              <div />
            </>
          );

          const Second = () => (
            <>
              <span />
            </>
          );
        `);

        expect(
          result.fragments,
        ).toHaveLength(2);
      },
    );
  },
);