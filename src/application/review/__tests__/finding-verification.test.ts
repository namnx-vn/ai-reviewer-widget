import { describe, expect, it } from "vitest";
import type { ReviewFinding } from "../../../domain/review";
import { createFindingEvidenceGraph } from "../../../domain/review/evidence";
import { createCounterexampleRegistry, verifyFindingCandidate } from "../finding-verification";

const finding: ReviewFinding = {
  id: "rule-1", ruleId: "security.no-eval", title: "Avoid eval", message: "Dynamic execution.",
  severity: "high", confidence: 1, source: "security", location: { file: "src/app.ts", line: 4 },
};
const graph = createFindingEvidenceGraph(finding, {
  id: "ast:eval:4", kind: "ast", reference: "CallExpression.eval", location: finding.location,
});
const context = { knownFiles: ["src/app.ts"], trustedEvidenceNodes: graph.nodes, counterexamples: createCounterexampleRegistry([]) };

describe("registered finding verification stages", () => {
  it("publishes only a claim bound to independently trusted evidence", () => {
    expect(verifyFindingCandidate({ finding, graph }, context)).toMatchObject({ action: "publish", finding, reasons: ["claim-supported"] });
  });

  it("does not let colocated metadata support an unrelated claim", () => {
    const sql = { ...finding, ruleId: "security.sql-injection", message: "SQL injection." };
    expect(verifyFindingCandidate({ finding: sql, graph }, context)).toMatchObject({ action: "downgrade", finding: { severity: "info" }, reasons: ["claim-mismatch"] });
  });

  it("does not trust a graph supplied by the finding producer without corroboration", () => {
    expect(verifyFindingCandidate({ finding, graph }, { ...context, trustedEvidenceNodes: [] })).toMatchObject({ action: "downgrade", reasons: ["missing-support"] });
  });

  it("checks exact canonical node metadata rather than trusting a reused ID", () => {
    const forged = { ...graph, nodes: [{ ...graph.nodes[0], reference: "Unrelated.call" }] };
    expect(verifyFindingCandidate({ finding, graph: forged }, context)).toMatchObject({ action: "downgrade", reasons: ["missing-support"] });
  });

  it("rejects trusted contradiction of the claim", () => {
    const contrary = { ...graph.nodes[0], id: "ast:counterproof", assertion: "contradicts" as const };
    const contradictory = { ...graph, nodes: [...graph.nodes, contrary], edges: [...graph.edges, { from: contrary.id, to: graph.claim.id, relation: "contradicts" as const }] };
    expect(verifyFindingCandidate({ finding, graph: contradictory }, { ...context, trustedEvidenceNodes: [...graph.nodes, contrary] })).toMatchObject({ action: "reject", reasons: ["claim-contradicted"] });
  });

  it("cannot manufacture a contradiction by relabeling a trusted support edge", () => {
    const forged = { ...graph, edges: [...graph.edges, { from: graph.nodes[0].id, to: graph.claim.id, relation: "contradicts" as const }] };
    expect(verifyFindingCandidate({ finding, graph: forged }, context).action).toBe("publish");
  });

  it.each([undefined, { ...graph, schemaVersion: 99 }])("downgrades missing or malformed graph %j", (input) => {
    expect(verifyFindingCandidate({ finding, graph: input }, context).action).toBe("downgrade");
  });

  it("downgrades source context outside the reviewed repository", () => {
    expect(verifyFindingCandidate({ finding, graph }, { ...context, knownFiles: [] })).toMatchObject({ action: "downgrade", reasons: ["unknown-file"] });
  });

  it("executes only matching rule-specific counterexamples with verified references", () => {
    const registry = createCounterexampleRegistry([
      { id: "security.safe-bound", ruleId: finding.ruleId, evaluate: () => ({ action: "reject", reasonCode: "safe-bound", evidenceNodeIds: [graph.nodes[0].id] }) },
      { id: "react.unrelated", ruleId: "react.hooks", evaluate: () => { throw new Error("must not run"); } },
    ]);
    expect(verifyFindingCandidate({ finding, graph }, { ...context, counterexamples: registry })).toMatchObject({ action: "reject", reasons: ["claim-supported", "counterexample:security.safe-bound:safe-bound"] });
  });

  it("cannot suppress mandatory controls using registered counterexamples", () => {
    const registry = createCounterexampleRegistry([{ id: "security.safe-bound", ruleId: finding.ruleId, evaluate: () => ({ action: "reject", reasonCode: "safe-bound", evidenceNodeIds: [graph.nodes[0].id] }) }]);
    expect(verifyFindingCandidate({ finding, graph }, { ...context, counterexamples: registry, mandatoryRuleIds: [finding.ruleId] })).toMatchObject({ action: "publish", reasons: ["claim-supported", "mandatory-counterexample-retained:security.safe-bound"] });
  });

  it("does not suppress on unverified counterexample references", () => {
    const registry = createCounterexampleRegistry([{ id: "security.safe-bound", ruleId: finding.ruleId, evaluate: () => ({ action: "reject", reasonCode: "safe-bound", evidenceNodeIds: ["invented"] }) }]);
    expect(verifyFindingCandidate({ finding, graph }, { ...context, counterexamples: registry })).toMatchObject({ action: "publish", reasons: ["claim-supported", "counterexample-unverified:security.safe-bound"] });
  });

  it("observes counterexample failure and degrades safely", () => {
    const registry = createCounterexampleRegistry([{ id: "security.failed", ruleId: finding.ruleId, evaluate: () => { throw new Error("private detail"); } }]);
    const result = verifyFindingCandidate({ finding, graph }, { ...context, counterexamples: registry });
    expect(result).toMatchObject({ action: "downgrade", reasons: ["claim-supported", "counterexample-failed:security.failed"] });
    expect(JSON.stringify(result)).not.toContain("private detail");
  });

  it("rejects wildcard and duplicate counterexample registrations", () => {
    const entry = { id: "security.safe", ruleId: finding.ruleId, evaluate: () => undefined };
    expect(() => createCounterexampleRegistry([entry, entry])).toThrow();
    expect(() => createCounterexampleRegistry([{ ...entry, ruleId: "*" }])).toThrow();
  });

  it("downgrades a verified rule-specific counterexample without mutating candidates", () => {
    const registry = createCounterexampleRegistry([{ id: "security.bounded", ruleId: finding.ruleId, evaluate: (input) => {
      expect(Reflect.set(input.finding, "severity", "critical")).toBe(false);
      if (input.finding.location) expect(Reflect.set(input.finding.location, "line", 999)).toBe(false);
      expect(Reflect.set(input.graph.nodes[0], "reference", "Forged.reference")).toBe(false);
      return { action: "downgrade", reasonCode: "bounded-context", evidenceNodeIds: [graph.nodes[0].id] };
    } }]);
    expect(verifyFindingCandidate({ finding, graph }, { ...context, counterexamples: registry })).toMatchObject({ action: "downgrade", finding: { severity: "info" }, reasons: ["claim-supported", "counterexample:security.bounded:bounded-context"] });
    expect(finding.location?.line).toBe(4);
    expect(finding.severity).toBe("high");
  });

  it("retains the positive when registered predicates find no counterexample", () => {
    const registry = createCounterexampleRegistry([{ id: "security.negative", ruleId: finding.ruleId, evaluate: () => undefined }]);
    expect(verifyFindingCandidate({ finding, graph }, { ...context, counterexamples: registry }).action).toBe("publish");
  });

  it("emits mandatory diagnostics when evidence is missing or contradicted", () => {
    const mandatoryContext = { ...context, mandatoryRuleIds: [finding.ruleId] };
    expect(verifyFindingCandidate({ finding }, mandatoryContext).reasons).toContain("mandatory-control-unverified");
    const contrary = { ...graph.nodes[0], assertion: "contradicts" as const };
    const contradictory = { ...graph, nodes: [contrary], edges: [{ from: contrary.id, to: graph.claim.id, relation: "contradicts" as const }] };
    expect(verifyFindingCandidate({ finding, graph: contradictory }, { ...mandatoryContext, trustedEvidenceNodes: [contrary] })).toMatchObject({ action: "reject", reasons: ["claim-contradicted", "mandatory-control-unverified"] });
  });
});
