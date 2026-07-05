import {
  describe,
  expect,
  it,
} from "vitest";
import { parseSource } from "../../../analyzer/ast/parser";
import {
  analyzeHooks,
} from "../hook-analyzer";

function analyze(
  source: string,
) {
  return analyzeHooks(
    parseSource(source),
  );
}

describe(
  "analyzeHooks",
  () => {
    it(
      "detects imported built-in hooks",
      () => {
        const result = analyze(`
          import {
            useState,
            useEffect,
          } from "react";

          function Counter() {
            const [count, setCount] =
              useState(0);

            useEffect(() => {
              console.log(count);
            }, [count]);

            return <div>{count}</div>;
          }
        `);

        expect(
          result.hooks.map(
            (hook) => hook.name,
          ),
        ).toEqual([
          "useState",
          "useEffect",
        ]);
      },
    );

    it(
      "classifies built-in hooks correctly",
      () => {
        const result = analyze(`
          import { useMemo } from "react";

          function App() {
            return useMemo(
              () => 42,
              [],
            );
          }
        `);

        expect(
          result.hooks[0],
        ).toMatchObject({
          name: "useMemo",
          kind: "builtin",
          isReactImport: true,
        });
      },
    );

    it(
      "detects custom hooks",
      () => {
        const result = analyze(`
          function useUser() {
            return useSomething();
          }

          function App() {
            const user = useUser();

            return (
              <div>{user.name}</div>
            );
          }
        `);

        expect(
          result.hooks.map(
            (hook) => hook.name,
          ),
        ).toEqual([
          "useSomething",
          "useUser",
        ]);

        expect(
          result.hooks[0]?.kind,
        ).toBe("custom");

        expect(
          result.hooks[1]?.kind,
        ).toBe("custom");
      },
    );

    it(
      "detects React namespace hooks",
      () => {
        const result = analyze(`
          import * as React from "react";

          function App() {
            const [value] =
              React.useState(0);

            React.useEffect(() => {
              console.log(value);
            }, [value]);

            return <div>{value}</div>;
          }
        `);

        expect(
          result.hooks.map(
            (hook) => hook.name,
          ),
        ).toEqual([
          "useState",
          "useEffect",
        ]);

        expect(
          result.hooks.every(
            (hook) =>
              hook.isReactImport,
          ),
        ).toBe(true);
      },
    );

    it(
      "detects aliased React imports",
      () => {
        const result = analyze(`
          import {
            useEffect as useFx,
          } from "react";

          function App() {
            useFx(() => {
              console.log("hello");
            }, []);

            return <div />;
          }
        `);

        expect(
          result.hooks,
        ).toHaveLength(1);

        expect(
          result.hooks[0],
        ).toMatchObject({
          name: "useEffect",
          kind: "builtin",
          isReactImport: true,
        });
      },
    );

    it(
      "does not classify ordinary functions as hooks",
      () => {
        const result = analyze(`
          function renderData() {
            return 42;
          }

          function App() {
            renderData();

            return <div />;
          }
        `);

        expect(
          result.hooks,
        ).toHaveLength(0);
      },
    );

    it(
      "does not classify userData as a hook",
      () => {
        const result = analyze(`
          function App() {
            userData();

            return <div />;
          }
        `);

        expect(
          result.hooks,
        ).toHaveLength(0);
      },
    );

    it(
      "does not classify computed member expressions as React hooks",
      () => {
        const result = analyze(`
          import * as React from "react";

          function App() {
            React["useEffect"](
              () => {},
              [],
            );

            return <div />;
          }
        `);

        expect(
          result.hooks,
        ).toHaveLength(0);
      },
    );

    it(
      "records enclosing function name",
      () => {
        const result = analyze(`
          import { useState } from "react";

          function Counter() {
            const [count] =
              useState(0);

            return <div>{count}</div>;
          }
        `);

        expect(
          result.hooks[0],
        ).toMatchObject({
          name: "useState",
          enclosingFunctionName:
            "Counter",
        });
      },
    );

    it(
      "records anonymous arrow function without a function name",
      () => {
        const result = analyze(`
          import { useEffect } from "react";

          const App = () => {
            useEffect(() => {}, []);

            return <div />;
          };
        `);

        expect(
          result.hooks[0],
        ).toMatchObject({
          name: "useEffect",
        });

        expect(
          result.hooks[0]?.enclosingFunctionName,
        ).toBeUndefined();
      },
    );

    it(
      "preserves source location",
      () => {
        const result = analyze(`
          import { useState } from "react";

          function App() {
            useState(0);
            return <div />;
          }
        `);

        expect(
          result.hooks[0]?.location,
        ).toEqual({
          line: 5,
          column: 12,
        });
      },
    );

    it(
      "detects hooks inside nested callbacks",
      () => {
        const result = analyze(`
          import { useEffect } from "react";

          function App() {
            const run = () => {
              useEffect(() => {}, []);
            };

            return <div />;
          }
        `);

        expect(
          result.hooks,
        ).toHaveLength(1);

        expect(
          result.hooks[0]?.name,
        ).toBe("useEffect");
      },
    );

    it(
      "does not treat non-react imported use-prefixed functions as built-in hooks",
      () => {
        const result = analyze(`
          import {
            useThing,
          } from "some-library";

          function App() {
            useThing();

            return <div />;
          }
        `);

        expect(
          result.hooks,
        ).toHaveLength(1);

        expect(
          result.hooks[0],
        ).toMatchObject({
          name: "useThing",
          kind: "custom",
          isReactImport: false,
        });
      },
    );
  },
);