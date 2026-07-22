import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import {
  analyzeIntraproceduralTaint,
  type TaintFlowAdapter,
  type TaintKind,
} from "../../src/analyzer/security/flow";

const kinds: readonly TaintKind[] = ["user-input", "secret", "credential", "payment-data", "path"];

function adapter(): TaintFlowAdapter {
  return {
    matchSource(node) {
      if (node.type === "Identifier" && node.name === "input") {
        return { node, label: "Untrusted input", sourceKind: "user-input", kinds };
      }
      return undefined;
    },
    matchSanitizer(node) {
      if (node.callee.type === "Identifier" && node.callee.name === "cleanPath") {
        return { node, label: "Path allowlist", sanitizerKind: "path-normalization", clears: ["path"], argumentIndex: 0 };
      }
      if (node.callee.type === "Identifier" && node.callee.name === "cleanHtml") {
        return { node, label: "HTML sanitizer", sanitizerKind: "html-escape", clears: ["html"], argumentIndex: 0 };
      }
      return undefined;
    },
    matchSinks(node) {
      if (node.type !== "CallExpression" || node.callee.type !== "Identifier" || node.arguments[0]?.type === "SpreadElement") {
        return [];
      }
      const family = node.callee.name === "usePath" ? "path" : node.callee.name === "revealSecret" ? "secret" : undefined;
      const value = node.arguments[0];
      return family === undefined || value === undefined || value.type === "SpreadElement"
        ? []
        : [{ family, node, value, label: `${family} sink`, sinkKind: "unknown" }];
    },
  };
}

function analyze(source: string) {
  return analyzeIntraproceduralTaint(parseSource(source), "src/example.ts", adapter());
}

describe("phase 3.6.19 deterministic taint engine", () => {
  it("tracks multi-label taint through aliases, templates, concatenation, conditionals, and destructuring", () => {
    const matches = analyze(`
      const payload = { path: input };
      const { path } = payload;
      const alias = path;
      const selected = flag ? \`/tmp/\${alias}\` : alias + ".txt";
      usePath(selected);
    `);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.state.kinds).toEqual(expect.arrayContaining(kinds));
    expect(matches[0]?.flow.map((step) => step.kind)).toEqual(expect.arrayContaining(["source", "transform", "sink"]));
  });

  it("is sink-aware: a wrong sanitizer does not clear path taint", () => {
    expect(analyze("usePath(cleanHtml(input));")).toHaveLength(1);
    expect(analyze("usePath(cleanPath(input));")).toEqual([]);
  });

  it("preserves source, propagation and sink evidence in a stable order", () => {
    const first = analyze("const value = input; usePath(value); revealSecret(value);");
    const second = analyze("const value = input; usePath(value); revealSecret(value);");

    expect(first).toEqual(second);
    expect(first[0]?.flow.at(0)?.label).toBe("Untrusted input");
    expect(first[0]?.flow.at(-1)?.label).toBe("path sink");
    expect(first.map((match) => match.sink.label)).toEqual(["path sink", "secret sink"]);
  });

  it("does not report clean values or labels that do not reach the matching sink", () => {
    expect(analyze('usePath("/srv/data");')).toEqual([]);
    expect(analyze("revealSecret(cleanPath(input));")).toHaveLength(1);
  });

  it("keeps taint attached to the accessed object property", () => {
    expect(analyze('const payload = { path: input, safe: "/srv" }; usePath(payload.safe);')).toEqual([]);
    expect(analyze('const payload = { path: input, safe: "/srv" }; usePath(payload.path);')).toHaveLength(1);
  });

  it("propagates direct local function arguments into the function scope", () => {
    expect(analyze("function handle(value: string) { usePath(value); } handle(input);")).toHaveLength(1);
  });
});
