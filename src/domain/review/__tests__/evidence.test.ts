import { describe, expect, it } from "vitest";
import type { ReviewFinding } from "../contracts";
import { createFindingEvidenceGraph, validateFindingEvidenceGraph } from "../evidence";

const finding: ReviewFinding = {
  id: "test-1", ruleId: "security.no-eval", title: "Avoid eval", message: "Dynamic execution.",
  source: "security", severity: "high", confidence: 1, location: { file: "src/app.ts", line: 4 },
};
const node = { id: "ast:eval:4", kind: "ast" as const, location: { file: "src/app.ts", line: 4 }, reference: "CallExpression.eval" };

describe("finding evidence graph", () => {
  it("creates a serializable claim-bound metadata graph with stable references", () => {
    const graph = createFindingEvidenceGraph(finding, node);
    expect(validateFindingEvidenceGraph(JSON.parse(JSON.stringify(graph)))).toMatchObject({ valid: true, graph });
    expect(graph.nodes[0]?.claimFingerprint).toBe(graph.claim.fingerprint);
    expect(graph.edges).toEqual([{ from: node.id, to: graph.claim.id, relation: "supports" }]);
    expect(createFindingEvidenceGraph({ ...finding, id: "different-run-id" }, node).claim.fingerprint).toBe(graph.claim.fingerprint);
    expect(JSON.stringify(graph)).not.toContain(finding.message);
  });

  it.each(["ast", "symbol", "scope", "call", "data-flow", "control-flow", "configuration", "import", "history"] as const)("supports %s metadata", (kind) => {
    expect(validateFindingEvidenceGraph(createFindingEvidenceGraph(finding, { ...node, kind })).valid).toBe(true);
  });

  it.each([
    { location: { file: "../secret.ts", line: 4 } },
    { location: { file: "/etc/passwd", line: 4 } },
    { location: { file: "src/app.ts", line: 0 } },
    { location: { file: "src/app.ts", line: 1.5 } },
    { reference: "eval(secretSource)" },
    { source: "const password = 'secret';" },
    { id: "" },
    { kind: "unknown" },
  ])("rejects invalid or raw source metadata %j", (overrides) => {
    const graph = createFindingEvidenceGraph(finding, node);
    expect(validateFindingEvidenceGraph({ ...graph, nodes: [{ ...graph.nodes[0], ...overrides }] }).valid).toBe(false);
  });

  it("rejects duplicate node IDs, missing endpoints, and unsupported schema", () => {
    const graph = createFindingEvidenceGraph(finding, node);
    for (const invalid of [
      { ...graph, nodes: [...graph.nodes, ...graph.nodes] },
      { ...graph, edges: [{ from: "missing", to: graph.claim.id, relation: "supports" }] },
      { ...graph, schemaVersion: 2 },
      { ...graph, rawSource: "secret" },
    ]) expect(validateFindingEvidenceGraph(invalid).valid).toBe(false);
  });

  it("bounds graph size and returns useful issues", () => {
    const graph = createFindingEvidenceGraph(finding, node);
    const invalid = validateFindingEvidenceGraph({ ...graph, nodes: Array.from({ length: 257 }, (_, id) => ({ ...node, id: `node:${id}` })) });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.length).toBeGreaterThan(0);
  });

  it("binds exact line and severity independently from lifecycle identity", () => {
    for (const changed of [
      { ...finding, location: { file: "src/app.ts", line: 5 } },
      { ...finding, severity: "critical" as const },
    ]) expect(createFindingEvidenceGraph(changed, node).claim.fingerprint).not.toBe(createFindingEvidenceGraph(finding, node).claim.fingerprint);
  });

  it("rejects invalid edge relation, direction, duplicates, and raw claim content", () => {
    const graph = createFindingEvidenceGraph(finding, node);
    for (const invalid of [
      { ...graph, edges: [{ from: node.id, to: graph.claim.id, relation: "proves-everything" }] },
      { ...graph, edges: [{ from: graph.claim.id, to: node.id, relation: "supports" }] },
      { ...graph, edges: [...graph.edges, ...graph.edges] },
      { ...graph, claim: { ...graph.claim, source: "raw code" } },
      { ...graph, nodes: [{ ...graph.nodes[0], assertion: "maybe" }] },
    ]) expect(validateFindingEvidenceGraph(invalid).valid).toBe(false);
  });
});
