import { describe, expect, it } from "vitest";
import { createDefaultReviewUseCases } from "../../application/review";
import { buildContinuousReliabilityReport } from "../continuous-report";
import { loadRealWorldEvaluationCorpus } from "../real-world";

describe("continuous reliability reporting", () => {
  it("keeps empirical qualification separate from complete synthetic PR/repository runs", async () => {
    const snapshot = { repositoryId: "synthetic/clean", snapshotId: "test-sha", files: [{ path: "src/value.ts", content: "export const value = 1;" }], expectedPaths: ["src/value.ts"], expectedFindings: [] };
    const report = await buildContinuousReliabilityReport(createDefaultReviewUseCases(), {
      corpus: loadRealWorldEvaluationCorpus().filter((entry) => [
        "vercel-next-96245-hmr-digest-serialization", "vercel-next-97184-app-loader-cache-hit-dependency",
        "vercel-next-96727-request-cache-completed-entry",
      ].includes(entry.evaluationCase.id)),
      pullRequest: { id: "test-pr", title: "Unchanged source", base: snapshot, head: snapshot, expectedIntroducedFindings: [] },
    });
    expect(report.corpus.summary.findingsPendingAdjudication).toBe(0);
    expect(report.corpus.summary.excludedFindingCount).toBe(6);
    expect(report.repository.completeness.status).toBe("complete");
    expect(report.pullRequest.parity).toBe(true);
    expect(report.promotionEligibility.status).toBe("insufficient-evidence");
    expect(report.promotionEligibility.reasons).toContain("Existing corpus has been inspected and is not independent holdout.");
    expect(JSON.stringify(report)).not.toContain("export const value = 1;");
  });
});
