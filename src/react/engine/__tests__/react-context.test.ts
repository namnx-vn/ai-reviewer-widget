import {
  describe,
  expect,
  it,
} from "vitest";

import { parseSource } from "../../../analyzer/ast/parser";

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
    const source = "const value = 1;";
    const ast = parseSource(source);

    const context = createReactAnalysisContext(
      source,
      "example.ts",
      ast,
      plugins,
    );

    expect(context.source).toBe(source);

    expect(context.file).toBe(
      "example.ts",
    );

    expect(context.ast).toBe(ast);

    expect(context.rules).toHaveLength(2);
  });

  it("supports plugins without rules", () => {
    const source = "";
    const ast = parseSource(source);

    const context = createReactAnalysisContext(
      source,
      "example.ts",
      ast,
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
    expect(context.ast).toBe(ast);
  });
});