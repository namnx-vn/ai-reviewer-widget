import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createReactAnalysisContext,
} from "../react-context";

import type {
  ReactPlugin,
} from "../react-plugin";

const firstRule = {
  id: "react.first",
  description: "First rule",
  check: () => [],
};

const secondRule = {
  id: "react.second",
  description: "Second rule",
  check: () => [],
};

const plugins: ReactPlugin[] = [
  {
    id: "plugin-one",
    name: "Plugin One",
    version: "1.0.0",
    rules: [firstRule],
  },
  {
    id: "plugin-two",
    name: "Plugin Two",
    version: "1.0.0",
    rules: [secondRule],
  },
];

describe("createReactAnalysisContext", () => {
  it("creates analysis context", () => {
    const context =
      createReactAnalysisContext(
        "const value = 1;",
        "example.ts",
        plugins,
      );

    expect(context.source).toBe(
      "const value = 1;",
    );

    expect(context.file).toBe(
      "example.ts",
    );

    expect(context.rules).toHaveLength(2);
  });

  it("supports plugins without rules", () => {
    const context =
      createReactAnalysisContext(
        "",
        "example.ts",
        [
          {
            id: "empty",
            name: "Empty",
            version: "1.0.0",
            rules: [],
          },
        ],
      );

    expect(context.rules).toHaveLength(0);
  });
});