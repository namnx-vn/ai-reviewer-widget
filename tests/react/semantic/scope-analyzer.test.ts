import {
  describe,
  expect,
  it,
} from "vitest";

import { parseSource } from "../../../src/analyzer/ast/parser";
import {
  analyzeScopes,
  resolveIdentifier,
} from "../../../src/react/semantic/scope";

function analyze(
  source: string,
) {
  return analyzeScopes(
    parseSource(source),
  );
}

describe(
  "scope analyzer",
  () => {
    it(
      "creates a program scope",
      () => {
        const result = analyze(`
          const value = 1;
        `);

        expect(
          result.rootScope.kind,
        ).toBe("program");
      },
    );

    it(
      "detects declarations",
      () => {
        const result = analyze(`
          const value = 1;
          let count = 2;
          var legacy = 3;
        `);

        expect(
          result.declarations.map(
            (item) => ({
              name: item.name,
              kind: item.kind,
            }),
          ),
        ).toEqual([
          {
            name: "value",
            kind: "const",
          },
          {
            name: "count",
            kind: "let",
          },
          {
            name: "legacy",
            kind: "var",
          },
        ]);
      },
    );

    it(
      "detects function parameters",
      () => {
        const result = analyze(`
          function add(
            left: number,
            right: number,
          ) {
            return left + right;
          }
        `);

        expect(
          result.declarations
            .filter(
              (item) =>
                item.kind ===
                "parameter",
            )
            .map(
              (item) =>
                item.name,
            ),
        ).toEqual([
          "left",
          "right",
        ]);
      },
    );

    it(
      "resolves parent scope references",
      () => {
        const result = analyze(`
          const value = 42;

          function App() {
            return value;
          }
        `);

        const reference =
          result.references.find(
            (item) =>
              item.name ===
                "value" &&
              !item.isWrite,
          );

        expect(
          reference?.declaration
            ?.name,
        ).toBe("value");
      },
    );

    it(
      "resolves local shadowing",
      () => {
        const result = analyze(`
          const value = "outer";

          function App() {
            const value = "inner";

            return value;
          }
        `);

        const reference =
          result.references.find(
            (item) =>
              item.name ===
                "value" &&
              !item.isWrite,
          );

        expect(
          reference?.declaration
            ?.location.line,
        ).toBe(5);
      },
    );

    it(
      "resolves block shadowing",
      () => {
        const result = analyze(`
          const value = "outer";

          function App() {
            {
              const value = "inner";
              return value;
            }
          }
        `);

        const reference =
          result.references.find(
            (item) =>
              item.name ===
                "value" &&
              !item.isWrite,
          );

        expect(
          reference?.declaration
            ?.location.line,
        ).toBe(6);
      },
    );

    it(
      "resolves imported references",
      () => {
        const result = analyze(`
          import {
            useEffect,
          } from "react";

          function App() {
            useEffect(
              () => {},
              [],
            );

            return null;
          }
        `);

        const reference =
          result.references.find(
            (item) =>
              item.name ===
                "useEffect" &&
              !item.isWrite,
          );

        expect(
          reference?.declaration,
        ).toMatchObject({
          name: "useEffect",
          kind: "import",
        });
      },
    );

    it(
      "detects unresolved references",
      () => {
        const result = analyze(`
          function App() {
            return missingValue;
          }
        `);

        const reference =
          result.references.find(
            (item) =>
              item.name ===
              "missingValue",
          );

        expect(
          reference,
        ).toBeDefined();

        expect(
          reference?.declaration,
        ).toBeUndefined();
      },
    );

    it(
      "detects assignment writes",
      () => {
        const result = analyze(`
          let count = 0;

          function increment() {
            count = count + 1;
          }
        `);

        const write =
          result.references.find(
            (item) =>
              item.name ===
                "count" &&
              item.isWrite,
          );

        expect(
          write?.declaration
            ?.name,
        ).toBe("count");
      },
    );

    it(
      "detects update writes",
      () => {
        const result = analyze(`
          let count = 0;

          function increment() {
            count++;
          }
        `);

        const write =
          result.references.find(
            (item) =>
              item.name ===
                "count" &&
              item.isWrite,
          );

        expect(
          write,
        ).toBeDefined();
      },
    );

    it(
      "does not treat member properties as references",
      () => {
        const result = analyze(`
          const user = {
            name: "Nam",
          };

          function App() {
            return user.name;
          }
        `);

        const names =
          result.references.map(
            (item) =>
              item.name,
          );

        expect(
          names,
        ).toContain("user");

        expect(
          names,
        ).not.toContain("name");
      },
    );

    it(
      "resolves nested closure references",
      () => {
        const result = analyze(`
          function App() {
            const value = 1;

            return function Child() {
              return value;
            };
          }
        `);

        const reference =
          result.references.find(
            (item) =>
              item.name ===
                "value" &&
              !item.isWrite,
          );

        expect(
          reference?.declaration
            ?.name,
        ).toBe("value");
      },
    );

    it(
      "supports destructured declarations",
      () => {
        const result = analyze(`
          const {
            user,
            settings,
          } = data;

          const [
            first,
            second,
          ] = values;
        `);

        expect(
          result.declarations
            .map(
              (item) =>
                item.name,
            ),
        ).toEqual([
          "user",
          "settings",
          "first",
          "second",
        ]);
      },
    );

    it(
      "supports explicit resolution",
      () => {
        const result = analyze(`
          const value = 1;

          function App() {
            return value;
          }
        `);

        const reference =
          result.references.find(
            (item) =>
              item.name ===
                "value" &&
              !item.isWrite,
          );

        expect(
          reference,
        ).toBeDefined();

        if (reference === undefined) {
          return;
        }

        const resolution =
          resolveIdentifier(
            result,
            reference.scopeId,
            "value",
          );

        expect(
          resolution.declaration
            ?.name,
        ).toBe("value");
      },
    );
  },
);