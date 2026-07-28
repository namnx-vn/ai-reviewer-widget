import { describe, expect, it } from "vitest";

import { analyzeFile } from "../..";
import { buildDependencyGraph, extractImportEdges } from "../analyzer";

describe("Micro-Frontend boundaries", () => {
  it("rejects remote-to-remote imports", () => {
    const findings = analyzeFile(
      "src/remote/Checkout.tsx",
      `
        import Payment from "@remote/payment";
      `,
    );

    expect(
      findings.some(
        (finding) =>
          finding.ruleId ===
          "mfe.no-remote-to-remote",
      ),
    ).toBe(true);
  });

  it("allows shared package imports", () => {
    const findings = analyzeFile(
      "src/remote/Checkout.tsx",
      `
        import Button from "@shared/ui";
      `,
    );

    expect(
      findings.some(
        (finding) =>
          finding.ruleId ===
          "mfe.no-remote-to-remote",
      ),
    ).toBe(false);
  });

  it("extracts multi-line and side-effect imports using the AST", () => {
    const edges = extractImportEdges("src/remote/Checkout.tsx", `
      import {
        Payment,
      } from "@remote/payment";
      import "./styles.css";
    `);

    expect(edges.map((edge) => edge.specifier)).toEqual(["@remote/payment", "./styles.css"]);
    expect(edges[0]?.line).toBe(4);
  });

  it("resolves relative imports in the reviewed file graph", () => {
    const graph = buildDependencyGraph([
      { path: "src/App.tsx", content: 'import { Button } from "./components/Button";' },
      { path: "src/components/Button.tsx", content: "export const Button = () => null;" },
    ]);

    expect(graph.edges[0]?.resolvedPath).toBe("src/components/Button.tsx");
  });

  it("analyzes JavaScript sources", () => {
    expect(analyzeFile("src/test.js", "console.log('test');")).toHaveLength(1);
  });
});
