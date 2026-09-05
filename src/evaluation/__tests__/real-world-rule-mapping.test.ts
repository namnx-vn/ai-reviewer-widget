import { describe, expect, it } from "vitest";

import { loadRealWorldEvaluationCorpus } from "../real-world";
import { REAL_WORLD_RULE_MAPPINGS } from "../real-world-rule-mapping";

describe("real-world production rule mappings", () => {
  it("maps only existing must-find expectations to non-empty production rule sets", () => {
    const corpus = loadRealWorldEvaluationCorpus();
    const identities = REAL_WORLD_RULE_MAPPINGS.map(
      ({ caseId, expectationId }) => `${caseId}:${expectationId}`,
    );

    expect(new Set(identities).size).toBe(REAL_WORLD_RULE_MAPPINGS.length);

    for (const mapping of REAL_WORLD_RULE_MAPPINGS) {
      const item = corpus.find(
        ({ evaluationCase }) => evaluationCase.id === mapping.caseId,
      );
      const expectation = item?.expectations.find(
        ({ id }) => id === mapping.expectationId,
      );

      expect(item).toBeDefined();
      expect(expectation?.kind).toBe("must-find");
      expect(mapping.acceptableRuleIds.length).toBeGreaterThan(0);
      expect(new Set(mapping.acceptableRuleIds).size).toBe(mapping.acceptableRuleIds.length);
    }
  });
});
