import { describe, expect, it } from "vitest";
import type { ReviewFinding } from "../../domain/review";
import type { AIReviewFinding } from "../types";
import { verifyAIFindings } from "../verification";

const deterministic: ReviewFinding = {
  id: "security-1", ruleId: "security.no-eval", title: "Avoid eval",
  message: "eval executes untrusted code.", severity: "high", source: "security",
  confidence: 1, location: { file: "src/app.ts", line: 10 },
};
const claim = { ruleId: deterministic.ruleId, deterministicFindingId: deterministic.id };
const candidate = {
  title: "Potential code execution", message: "Review dynamic execution.",
  severity: "critical" as const, confidence: 0.8, file: "src/app.ts", line: 10,
};
const context = { deterministicFindings: [deterministic], knownFiles: ["src/app.ts"] };

describe("AI finding verification", () => {
  it("binds an explicit matching hypothesis to the canonical detector conclusion without raising confidence", () => {
    const [finding] = verifyAIFindings([{ ...candidate, verificationClaim: claim }], context);
    expect(finding).toMatchObject({
      title: deterministic.title, message: deterministic.message, severity: "high", confidence: 0.8,
      evidence: { status: "supported", provenance: [
        { kind: "repository-file", reference: "src/app.ts" },
        { kind: "deterministic-finding", reference: "security.no-eval@src/app.ts:10" },
      ] },
    });
  });

  it("does not support SQL injection from a colocated React hook warning", () => {
    const [finding] = verifyAIFindings([{
      ...candidate, title: "SQL injection", message: "This query allows SQL injection.", confidence: 1,
    }], { ...context, deterministicFindings: [{ ...deterministic, ruleId: "react.hooks.missing-deps" }] });
    expect(finding).toMatchObject({ severity: "info", confidence: 0.4, evidence: { status: "unverifiable" } });
  });

  it("does not launder an invented conclusion by naming a real detector", () => {
    const [finding] = verifyAIFindings([{
      ...candidate, verificationClaim: claim, title: "SQL injection", message: "Critical SQL injection",
      suggestion: "Remove all authorization checks.", confidence: 1,
    }], context);
    expect(finding?.message).toBe(deterministic.message);
    expect(finding?.title).toBe(deterministic.title);
    expect(finding?.suggestion).toBeUndefined();
    expect(finding?.severity).toBe("high");
    expect(finding?.confidence).toBe(0.99);
  });

  it.each([
    { verificationClaim: { ...claim, ruleId: "security.sql-injection" } },
    { verificationClaim: { ...claim, deterministicFindingId: "different-finding" } },
    { line: 11 },
    { line: undefined },
    { line: 0 },
    { file: "src/not-present.ts" },
  ])("does not support contradictory identity/location: %j", (overrides) => {
    const [finding] = verifyAIFindings([{ ...candidate, verificationClaim: claim, ...overrides }], context);
    expect(finding?.evidence.status).not.toBe("supported");
    expect(finding?.severity).toBe("info");
    expect(finding?.confidence).toBeLessThanOrEqual(0.4);
  });

  it("does not accept provider-supplied evidence without independent verification", () => {
    const [finding] = verifyAIFindings([{
      ...candidate, evidence: { status: "supported", provenance: [] }, confidence: 1,
    }], context);
    expect(finding?.evidence.status).toBe("unverifiable");
    expect(finding?.severity).toBe("info");
  });

  it("requires a deterministic source with a positive line and non-contradictory evidence", () => {
    for (const evidenceFinding of [
      { ...deterministic, source: "ai" as const },
      { ...deterministic, location: { file: "src/app.ts" } },
      { ...deterministic, evidence: { status: "unsupported" as const, provenance: [] } },
    ]) {
      const [finding] = verifyAIFindings([{ ...candidate, verificationClaim: claim }], {
        ...context, deterministicFindings: [evidenceFinding],
      });
      expect(finding?.evidence.status).not.toBe("supported");
    }
  });

  it("preserves stable references when detector output order changes", () => {
    const [finding] = verifyAIFindings([{ ...candidate, verificationClaim: { ...claim, deterministicFindingId: "security-99" } }], {
      ...context, deterministicFindings: [{ ...deterministic, id: "security-99" }],
    });
    expect(finding?.evidence.provenance[1]?.reference).toBe("security.no-eval@src/app.ts:10");
  });

  it("degrades missing repository context to an observable advisory", () => {
    const findings: AIReviewFinding[] = [{ ...candidate, file: undefined, line: undefined, confidence: 1 }];
    const [finding] = verifyAIFindings(findings, { deterministicFindings: [], knownFiles: [] });
    expect(finding).toMatchObject({ severity: "info", confidence: 0.4, evidence: { status: "unverifiable", provenance: [] } });
  });

  it("fails closed when a verification dependency throws", () => {
    const [finding] = verifyAIFindings([{ ...candidate, verificationClaim: claim }], {
      knownFiles: ["src/app.ts"],
      get deterministicFindings(): readonly ReviewFinding[] { throw new Error("context unavailable"); },
    });
    expect(finding).toMatchObject({ severity: "info", confidence: 0.4, evidence: { status: "unverifiable", reason: "verification-failed" } });
  });

  it("rejects ambiguous matching identities", () => {
    const [finding] = verifyAIFindings([{ ...candidate, verificationClaim: claim }], {
      ...context, deterministicFindings: [deterministic, { ...deterministic, message: "Conflicting conclusion" }],
    });
    expect(finding).toMatchObject({ severity: "info", evidence: { status: "unsupported", reason: "claim-mismatch" } });
  });
});
