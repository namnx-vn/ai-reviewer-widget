import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ReactEngine,
} from "../react-engine";

import type {
  ReactPlugin,
} from "../react-plugin";

describe("ReactEngine", () => {
  it("runs registered React rules against the AST", () => {
    const check = vi.fn(() => []);

    const plugin: ReactPlugin = {
      id: "test",
      name: "Test",
      version: "1.0.0",
      rules: [
        {
          id: "react.test",
          description: "Test rule",
          check,
        },
      ],
    };

    const engine =
      new ReactEngine();

    engine.analyze({
      source: `
        function Component() {
          return <div>Hello</div>;
        }
      `,
      file: "Component.tsx",
      plugins: [plugin],
    });

    expect(check).toHaveBeenCalled();
  });

  it("returns findings produced by rules", () => {
    const plugin: ReactPlugin = {
      id: "test",
      name: "Test",
      version: "1.0.0",
      rules: [
        {
          id: "react.test",
          description: "Test rule",

          check: (_node, context) => [
            {
              id: "react.test:Component.tsx:1",
              ruleId: "react.test",
              title: "Test finding",
              message: "Test message",
              severity: "low",
              source: "ast",
              confidence: 1,
              location: {
                file: context.file,
                line: 1,
              },
              suggestion:
                "Fix the test finding.",
            },
          ],
        },
      ],
    };

    const engine =
      new ReactEngine();

    const findings =
      engine.analyze({
        source: `
          function Component() {
            return <div />;
          }
        `,
        file: "Component.tsx",
        plugins: [plugin],
      });

    expect(findings.length).toBeGreaterThan(0);

    expect(
      findings[0]?.ruleId,
    ).toBe("react.test");

    expect(
      findings[0]?.confidence,
    ).toBe(1);
  });

  it("supports multiple plugins", () => {
    const calls: string[] = [];

    const plugins: ReactPlugin[] = [
      {
        id: "plugin-one",
        name: "Plugin One",
        version: "1.0.0",
        rules: [
          {
            id: "react.one",
            description: "Rule one",

            check: () => {
              calls.push("one");
              return [];
            },
          },
        ],
      },
      {
        id: "plugin-two",
        name: "Plugin Two",
        version: "1.0.0",
        rules: [
          {
            id: "react.two",
            description: "Rule two",

            check: () => {
              calls.push("two");
              return [];
            },
          },
        ],
      },
    ];

    const engine =
      new ReactEngine();

    engine.analyze({
      source: "const value = 1;",
      file: "example.ts",
      plugins,
    });

    expect(
      calls.includes("one"),
    ).toBe(true);

    expect(
      calls.includes("two"),
    ).toBe(true);
  });

  it("does not crash when a rule throws", () => {
    const plugin: ReactPlugin = {
      id: "broken",
      name: "Broken",
      version: "1.0.0",
      rules: [
        {
          id: "react.broken",
          description: "Broken rule",

          check: () => {
            throw new Error(
              "Unexpected failure",
            );
          },
        },
      ],
    };

    const engine =
      new ReactEngine();

    expect(() =>
      engine.analyze({
        source: "const value = 1;",
        file: "example.ts",
        plugins: [plugin],
      }),
    ).not.toThrow();
  });

  it("does not mutate the input plugins", () => {
    const plugins: ReactPlugin[] = [
      {
        id: "test",
        name: "Test",
        version: "1.0.0",
        rules: [],
      },
    ];

    const snapshot =
      [...plugins];

    const engine =
      new ReactEngine();

    engine.analyze({
      source: "const value = 1;",
      file: "example.ts",
      plugins,
    });

    expect(plugins).toEqual(
      snapshot,
    );
  });
});