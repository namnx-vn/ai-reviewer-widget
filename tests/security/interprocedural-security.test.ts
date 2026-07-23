import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import {
  analyzeInterproceduralTaint,
  type TaintFlowAdapter,
} from "../../src/analyzer/security/flow";

const adapter: TaintFlowAdapter = {
  matchSource(node) {
    return node.type === "Identifier" && node.name === "input"
      ? { node, label: "Untrusted input", sourceKind: "user-input", kinds: ["path"] }
      : undefined;
  },
  matchSanitizer() { return undefined; },
  matchSinks(node) {
    if (node.type !== "CallExpression" || node.callee.type !== "Identifier" || node.callee.name !== "usePath") return [];
    const value = node.arguments[0];
    return value === undefined || value.type === "SpreadElement"
      ? []
      : [{ family: "path", node, value, label: "path sink", sinkKind: "filesystem-path" }];
  },
};

function analyze(source: string) {
  return analyzeInterproceduralTaint(parseSource(source), "src/example.ts", adapter);
}

describe("phase 3.6.20 interprocedural security analysis", () => {
  it("propagates taint through named wrappers and returned values", () => {
    const findings = analyze(`
      const normalize = (value: string) => value;
      function wrapper(value: string) { return normalize(value); }
      const result = wrapper(input);
      usePath(result);
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.flow.map((step) => step.label)).toEqual(expect.arrayContaining([
      "Untrusted input",
      "Returned from normalize",
      "Returned from wrapper",
      "path sink",
    ]));
  });

  it("uses direct aliases and function expressions in the same-file call graph", () => {
    expect(analyze(`
      const identity = function(value: string) { return value; };
      const alias = identity;
      usePath(alias(input));
    `)).toHaveLength(1);
  });

  it("bounds recursive calls deterministically and does not treat unresolved calls as sanitizers", () => {
    const source = `
      function first(value: string) { return second(value); }
      function second(value: string) { return first(value); }
      const result = unknown(first(input));
      usePath(result);
    `;
    expect(analyze(source)).toEqual(analyze(source));
    expect(analyze(source)).toHaveLength(1);
  });
});
