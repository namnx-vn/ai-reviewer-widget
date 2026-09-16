import { describe, expect, it } from "vitest";
import { createDefaultReviewUseCases, type ReviewUseCases } from "../../application/review";
import { aggregateReview } from "../../domain/review";
import { runCandidateTournament } from "../tournament";
import type { PullRequestEvaluationInput } from "../repository-review";

const snapshot = (id: string) => ({ repositoryId: "example/repo", snapshotId: id,
  files: [{ path: "src/value.ts", content: "export const value = 1;" }],
  expectedPaths: ["src/value.ts"], expectedFindings: [] });
const pr: PullRequestEvaluationInput = { id: "example-pr", title: "No semantic change",
  base: snapshot("base"), head: snapshot("head"), expectedIntroducedFindings: [] };
const identity = { candidateId: "candidate", artifactDigest: "a".repeat(64), baselineVersion: "0", datasetVersion: "dataset" };
const policy = { policyVersion: "tournament-v1", minimumCases: 2, minimumRepositories: 2,
  maximumRuntimeRegression: 0.2, maximumDuplicateRate: 0.01, minimumStability: 1 };
const stable: ReviewUseCases = { reviewFiles: () => aggregateReview([], 1),
  reviewPullRequest: async () => aggregateReview([], 1) };
const input = () => ({ production: stable, candidates: [{ ...identity, useCases: stable }], cases: [pr], policy });

describe("candidate tournament", () => {
  it("runs production and candidates through shared base/head/incremental pipeline without fabricated qualification", async () => {
    const result = await runCandidateTournament({ ...input(), production: createDefaultReviewUseCases(),
      candidates: [{ ...identity, useCases: createDefaultReviewUseCases() }] });
    expect(result.candidates[0]).toMatchObject({ ...identity, qualificationStatus: "insufficient-evidence",
      operationalStatus: "pass", stability: 1 });
    expect(result.candidates[0].runs[0]).toMatchObject({ caseId: pr.id, parity: true, contextComplete: true });
    expect(result.recommendation).toBeNull();
  });
  it("fails an unstable candidate even with insufficient quality samples", async () => {
    let calls = 0;
    const unstable: ReviewUseCases = { ...stable, reviewPullRequest: async () => aggregateReview([
      { id: `id-${calls++}`, ruleId: "quality.example", source: "ast", title: "Example", message: "Example",
        severity: calls % 2 ? "high" : "low", confidence: 1, location: { file: "src/value.ts", line: 1 } },
    ], 1) };
    const result = await runCandidateTournament({ ...input(), candidates: [{ ...identity, useCases: unstable }] });
    expect(result.candidates[0].qualificationStatus).toBe("fail");
    expect(result.candidates[0].reasons.join(" ")).toMatch(/stability|parity/i);
  });
  it("reports crashes as operational failures without issuing a recommendation", async () => {
    const crashing: ReviewUseCases = { ...stable, reviewPullRequest: async () => { throw new Error("private source details"); } };
    const result = await runCandidateTournament({ ...input(), candidates: [{ ...identity, useCases: crashing }] });
    expect(result.candidates[0]).toMatchObject({ operationalStatus: "fail", qualificationStatus: "fail" });
    expect(JSON.stringify(result)).not.toContain("private source details");
  });
  it("rejects duplicate candidates, mismatched base identity and invalid budgets", async () => {
    await expect(runCandidateTournament({ ...input(), candidates: [...input().candidates, ...input().candidates] })).rejects.toThrow(/unique/i);
    await expect(runCandidateTournament({ ...input(), candidates: [{ ...identity, baselineVersion: "1", useCases: stable },
      { ...identity, candidateId: "other", useCases: stable }] })).rejects.toThrow(/baseline/i);
    await expect(runCandidateTournament({ ...input(), policy: { ...policy, maximumRuntimeRegression: NaN } })).rejects.toThrow(/policy/i);
  });
  it("isolates semantic evaluator failures to one candidate and redacts private errors", async () => {
    const crashing: ReviewUseCases = { ...stable, reviewFiles: () => { throw new Error("private source details"); } };
    const semanticCorpus = { version: 1 as const, id: "semantic", fidelity: "synthetic-offline" as const,
      cases: [{ id: "case", category: "security", files: [{ path: "src/value.ts", content: "export const value = 1" }],
        expectations: [], transformations: ["comments" as const] }] };
    const result = await runCandidateTournament({ ...input(), candidates: [
      { ...identity, candidateId: "a-crashing", useCases: crashing },
      { ...identity, candidateId: "b-stable", useCases: stable },
    ], semanticCorpus });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].reasons.join(" ")).toContain("Semantic/adversarial evaluation failed");
    expect(JSON.stringify(result)).not.toContain("private source details");
  });
});
