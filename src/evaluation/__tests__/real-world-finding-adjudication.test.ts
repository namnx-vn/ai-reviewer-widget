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
    expect(REAL_WORLD_FINDING_ADJUDICATIONS).toHaveLength(36);
    expect(REAL_WORLD_FINDING_ADJUDICATIONS.filter(
      ({ verdict }) => verdict === "true-positive",
    )).toHaveLength(19);
    expect(REAL_WORLD_FINDING_ADJUDICATIONS.filter(
      ({ verdict }) => verdict === "false-positive",
    )).toHaveLength(11);
    expect(REAL_WORLD_FINDING_ADJUDICATIONS.filter(
      ({ verdict }) => verdict === "invalid-fixture",
    )).toHaveLength(6);

    const expansionCaseIds = new Set(corpus.filter(
      ({ cohort }) => cohort === "expansion-wave-1",
    ).map(({ evaluationCase }) => evaluationCase.id));
    const expansionVerdicts = REAL_WORLD_FINDING_ADJUDICATIONS.filter(
      ({ caseId }) => expansionCaseIds.has(caseId),
    );
    expect(expansionVerdicts).toHaveLength(7);
    for (const verdict of expansionVerdicts) {
      expect(verdict.verdict).not.toBe("true-positive");
      expect(verdict.provenance?.headSha).toMatch(/^[a-f0-9]{40}$/u);
      expect(verdict.provenance?.sourceUrl).toContain(verdict.provenance?.headSha);
      expect(verdict.provenance?.fixtureAssessment.length).toBeGreaterThan(0);
    }

    for (const adjudication of REAL_WORLD_FINDING_ADJUDICATIONS) {
      const observedCase = report.cases.find(({ id }) => id === adjudication.caseId);
      const observedFinding = observedCase?.findings.find(
        ({ id }) => id === adjudication.findingId,
      );
      expect(observedFinding).toBeDefined();
      expect(adjudication.rationale.length).toBeGreaterThan(0);
      expect(findRealWorldFindingAdjudication(
        adjudication.caseId,
        adjudication.findingId,
      )).toBe(adjudication);

      if (adjudication.verdict === "true-positive") {
        const expectation = observedCase?.expectations.find(
          ({ id }) => id === adjudication.expectationId,
        );
        expect(expectation?.kind).toBe("must-find");
      } else {
        expect(adjudication.expectationId).toBeUndefined();
      }
    }
  }, 25_000);
});
