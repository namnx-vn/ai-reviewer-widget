import { describe, expect, it } from "vitest";
import { aggregateReview, createFindingEvidenceGraph, type ReviewFinding } from "../../../domain/review";
import { createReliableReviewUseCases } from "../reliable-use-cases";
import { createDefaultReviewUseCases } from "../index";

const files = [{ path: "src/run.ts", content: "export const run = (input: string) => eval(input);" }];
const policy = { version: "trust-v1", minimumRepositories: 15, minimumFindings: 100,
  minimumBlockingPrecision: 0.98, minimumCommentPrecision: 0.9,
  maximumCalibrationError: 0.05, minimumCalibrationSamples: 100 };
const finding: ReviewFinding = { id: "eval", ruleId: "security.no-eval", title: "Unsafe eval", message: "Unsafe eval",
  severity: "critical", source: "ast", confidence: 1, location: { file: "src/run.ts", line: 1 } };
const core = { reviewFiles: () => aggregateReview([finding], 1), reviewPullRequest: async () => aggregateReview([finding], 1) };
function evidence(value: ReviewFinding) {
  const graph = createFindingEvidenceGraph(value, { id: "syntax", kind: "ast", reference: "detector:eval", location: value.location });
  return { graph, trustedEvidenceNodes: graph.nodes };
}
const trust = (value: ReviewFinding, verified: boolean) => ({ ruleId: value.ruleId, ruleFamily: "security", severity: value.severity,
  policy, evidence: { contractVersion: "evidence-v1", verified, contradictory: false } });
describe("shared reliability review use cases", () => {
  it("requires measured trust for blocking and preserves deterministic confidence compatibility outside reliability mode", () => {
    const ordinary = createDefaultReviewUseCases().reviewFiles(files);
    expect(ordinary.findings.some((f) => f.severity === "critical")).toBe(true);
    const guarded = createReliableReviewUseCases({ useCases: core, evidence, trust });
    const result = guarded.reviewFiles(files);
    expect(result.findings[0]).toMatchObject({ severity: "info", confidence: 0.4 });
    expect(result.findingVerification[0].trust.status).toBe("insufficient-evidence");
    expect(core.reviewFiles().findings[0].severity).toBe("critical");
  });
  it("uses the same evidence/trust guard for asynchronous PR review", async () => {
    const result = await createReliableReviewUseCases({ useCases: core, evidence, trust }).reviewPullRequest({ title: "Example", files });
    expect(result.findingVerification[0].verification.action).toBe("publish");
    expect(result.findings[0].severity).toBe("info");
  });
  it("fails closed when mandatory evidence is missing or the trusted port crashes", () => {
    const result = createReliableReviewUseCases({ useCases: core, mandatoryRuleIds: [finding.ruleId],
      evidence: () => { throw new Error("private raw source"); }, trust }).reviewFiles(files);
    expect(result.decision).toBe("FAIL");
    expect(result.warnings.some((w) => w.code === "FINDING_VERIFICATION_FAILED")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private raw source");
  });
  it("rejects a trust receipt for a different rule instead of publishing it", () => {
    const result = createReliableReviewUseCases({ useCases: core, evidence,
      trust: (value, verified) => ({ ...trust(value, verified), ruleId: "other.rule" }) }).reviewFiles(files);
    expect(result.findings[0].severity).toBe("info");
    expect(result.warnings.some((w) => w.code === "FINDING_VERIFICATION_FAILED")).toBe(true);
  });
  it("fails closed when mandatory analyzers cannot parse the source and emit no finding", () => {
    const result = createReliableReviewUseCases({ useCases: createDefaultReviewUseCases(),
      mandatoryRuleIds: ["security.no-eval"], evidence, trust }).reviewFiles([
      { path: "src/broken.ts", content: "const = eval(input)" },
    ]);
    expect(result.findings).toEqual([]);
    expect(result.decision).toBe("FAIL");
    expect(result.warnings.map((warning) => warning.code)).toContain("SOURCE_PARSE_FAILED");
    expect(result.warnings.map((warning) => warning.code)).toContain("FINDING_VERIFICATION_FAILED");
  });
});
