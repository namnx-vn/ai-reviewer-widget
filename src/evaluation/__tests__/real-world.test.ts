import { describe, expect, it } from "vitest";

import { createDefaultReviewUseCases } from "../../application/review";
import {
  countRealWorldExpectations,
  loadRealWorldEvaluationCorpus,
} from "../real-world";

describe("real-world public PR evaluation corpus", () => {
  it("keeps provenance and labeled expectations explicit", () => {
    const corpus = loadRealWorldEvaluationCorpus();

    expect(corpus).toHaveLength(3);
    expect(new Set(corpus.map(({ source }) => `${source.repository}#${source.number}`)).size).toBe(3);
    expect(countRealWorldExpectations(corpus, "must-find")).toBe(1);
    expect(countRealWorldExpectations(corpus, "must-not-find")).toBe(2);
    expect(countRealWorldExpectations(corpus, "advisory")).toBe(1);

    for (const item of corpus) {
      expect(item.source.url).toBe(`https://github.com/${item.source.repository}/pull/${item.source.number}`);
      expect(item.source.headSha).toMatch(/^[0-9a-f]{40}$/);
      expect(item.evaluationCase.files).toHaveLength(1);
      expect(item.evaluationCase.files[0]?.content.length).toBeGreaterThan(0);
    }
  });

  it("reviews minimized public PR reproductions deterministically without crashing", () => {
    const reviewUseCases = createDefaultReviewUseCases();
    const corpus = loadRealWorldEvaluationCorpus();
    const key = (finding: { readonly ruleId: string; readonly id: string }): string =>
      `${finding.ruleId}:${finding.id}`;

    for (const item of corpus) {
      const first = reviewUseCases.reviewFiles(item.evaluationCase.files);
      const second = reviewUseCases.reviewFiles(item.evaluationCase.files);

      expect(second.findings.map(key).sort()).toEqual(first.findings.map(key).sort());
    }
  });
});
