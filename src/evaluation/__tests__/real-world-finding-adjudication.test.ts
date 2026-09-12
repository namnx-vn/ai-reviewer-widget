import { describe, expect, it } from "vitest";

import { createDefaultReviewUseCases } from "../../application/review";
import {
  findRealWorldFindingAdjudication,
  REAL_WORLD_FINDING_ADJUDICATIONS,
} from "../real-world-finding-adjudication";
import { buildRealWorldObservationReport } from "../real-world-observation";
import { loadRealWorldEvaluationCorpus } from "../real-world";

describe("real-world finding adjudication", () => {
  it("classifies only reviewed emitted findings with unique auditable identities", () => {
    const corpus = loadRealWorldEvaluationCorpus();
    const report = buildRealWorldObservationReport(
      createDefaultReviewUseCases(),
      corpus,
    );
    const identities = REAL_WORLD_FINDING_ADJUDICATIONS.map(
      ({ caseId, findingId }) => `${caseId}:${findingId}`,
    );

    expect(new Set(identities).size).toBe(identities.length);
    expect(REAL_WORLD_FINDING_ADJUDICATIONS).toHaveLength(17);

    for (const adjudication of REAL_WORLD_FINDING_ADJUDICATIONS) {
      const observedCase = report.cases.find(({ id }) => id === adjudication.caseId);
      const observedFinding = observedCase?.findings.find(
        ({ id }) => id === adjudication.findingId,
      );
      const expectation = observedCase?.expectations.find(
        ({ id }) => id === adjudication.expectationId,
      );

      expect(observedFinding).toBeDefined();
      expect(adjudication.verdict).toBe("true-positive");
      expect(expectation?.kind).toBe("must-find");
      expect(adjudication.rationale.length).toBeGreaterThan(0);
      expect(findRealWorldFindingAdjudication(
        adjudication.caseId,
        adjudication.findingId,
      )).toBe(adjudication);
    }
  }, 25_000);
});
