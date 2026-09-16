import { describe, expect, it } from 'vitest';
import { evaluatePromotionQuality, parsePromotionQualityInput, wilsonLowerBound } from '../quality-gates';
import type { PromotionQualityInput, QualityCaseCounts } from '../quality-gates';

const counts: QualityCaseCounts = {
  truePositives: 2, falsePositives: 0, blockingTruePositives: 1, blockingFalsePositives: 0,
  positiveExpected: 2, positiveDetected: 2, protectedPositiveExpected: 1, protectedPositiveDetected: 1,
  criticalPositiveExpected: 1, criticalPositiveDetected: 1, criticalFalsePositives: 0,
  negativeControls: 1, negativeControlFalsePositives: 0, unadjudicated: 0,
};
const input: PromotionQualityInput = {
  candidateId: "candidate-v1", artifactDigest: "a".repeat(64), baselineVersion: "production-v1", datasetVersion: "dataset-v1",
  candidateExposure: { caseIds: ["dev"], repositoryIds: ["dev"], trainedThrough: "2024-02-01T00:00:00.000Z" },
  ruleFamily: "security",
  manifest: {
    schemaVersion: '1', manifestId: 'gate-holdout-v1',
    development: [{ caseId: 'dev', repositoryId: 'dev', observedAt: '2024-01-01T00:00:00.000Z' }],
    calibration: [{ caseId: 'cal', repositoryId: 'cal', observedAt: '2024-02-01T00:00:00.000Z' }],
    protectedHoldout: Array.from({ length: 20 }, (_, i) => ({
      caseId: `case-${i}`, repositoryId: `repo-${i}`, observedAt: '2024-03-01T00:00:00.000Z',
    })),
  },
  policy: {
    policyVersion: 'test-v1', minimumCases: 10, minimumRepositories: 10,
    minimumPrecisionRepositories: 10, minimumBlockingPrecisionRepositories: 10,
    minimumPositiveExpectations: 10, minimumProtectedPositiveExpectations: 10, minimumCriticalPositiveExpectations: 10, minimumNegativeControls: 10,
    minimumPrecision: 0.8, minimumBlockingPrecision: 0.8, minimumRecall: 0.9,
    maximumRecallRegression: 0, maximumNegativeControlFalsePositives: 0,
  },
  cases: Array.from({ length: 20 }, (_, i) => ({
    caseId: `case-${i}`, repositoryId: `repo-${i}`, observedAt: "2024-03-01T00:00:00.000Z", ruleFamily: "security", fidelity: "verified-source", snapshotRef: "snapshot-v1", adjudicationRef: "adjudication-v1", executionSucceeded: true, contextComplete: true,
    candidate: { ...counts }, production: { ...counts },
  })),
};

describe('promotion quality gate', () => {
  it('passes sufficient paired evidence and reports separate operational health', () => {
    const report = evaluatePromotionQuality(input);
    expect(report.qualityStatus).toBe('pass');
    expect(report.operationalStatus).toBe('pass');
    expect(report.policyVersion).toBe('test-v1');
    expect(report.metrics.precision).toBe(1);
    expect(report.metrics.precisionRepositoryLowerBound).toBeLessThan(1);
  });
  it('does not claim 98 percent from a small perfect sample', () => {
    expect(evaluatePromotionQuality({ ...input, policy: { ...input.policy, minimumPrecision: 0.98 } }).qualityStatus).toBe('fail');
  });
  it('reports insufficient evidence when samples or denominators are missing', () => {
    const emptyFindings = input.cases.map(c => ({ ...c, candidate: { ...counts, truePositives: 0, blockingTruePositives: 0 } }));
    expect(evaluatePromotionQuality({ ...input, cases: emptyFindings }).qualityStatus).toBe('insufficient-evidence');
    expect(evaluatePromotionQuality({ ...input, policy: { ...input.policy, minimumCases: 100 } }).qualityStatus).toBe('insufficient-evidence');
  });
  it('does not inflate the independent sample with findings from one repository', () => {
    const oneRepo = {
      ...input, manifest: { ...input.manifest, protectedHoldout: input.manifest.protectedHoldout.map(c => ({ ...c, repositoryId: 'one' })) },
      cases: input.cases.map(c => ({ ...c, repositoryId: 'one' })),
    };
    expect(evaluatePromotionQuality(oneRepo).qualityStatus).toBe('insufficient-evidence');
  });
  it('rejects positive regressions and critical false positives', () => {
    for (const override of [{ positiveDetected: 0, protectedPositiveDetected: 0, criticalPositiveDetected: 0 }, { protectedPositiveDetected: 0 }, { criticalPositiveDetected: 0 }, { criticalFalsePositives: 1, falsePositives: 1 }, { negativeControlFalsePositives: 1, falsePositives: 1 }]) {
      const cases = input.cases.map((c, i) => i === 0 ? { ...c, candidate: { ...counts, ...override } } : c);
      expect(evaluatePromotionQuality({ ...input, cases }).qualityStatus).toBe('fail');
    }
  });
  it('prevents severity downgrade from hiding a correct blocking detection', () => {
    const cases = input.cases.map((c, i) => i === 0 ? { ...c, candidate: { ...counts, blockingTruePositives: 0 } } : c);
    expect(evaluatePromotionQuality({ ...input, cases }).qualityStatus).toBe('fail');
  });
  it('requires complete execution and adjudication', () => {
    const cases = input.cases.map((c, i) => i === 0 ? { ...c, executionSucceeded: false, candidate: { ...counts, unadjudicated: 1 } } : c);
    const result = evaluatePromotionQuality({ ...input, cases });
    expect(result.operationalStatus).toBe('fail');
    expect(result.qualityStatus).toBe('insufficient-evidence');
  });
  it('rejects invalid policies, mismatched pairs, and fabricated count denominators', () => {
    expect(() => evaluatePromotionQuality({ ...input, policy: { ...input.policy, minimumRecall: NaN } })).toThrow();
    expect(() => evaluatePromotionQuality({ ...input, cases: [...input.cases, input.cases[0]] })).toThrow();
    expect(() => evaluatePromotionQuality({ ...input, cases: input.cases.map(c => ({ ...c, production: { ...counts, positiveExpected: 3 } })) })).toThrow();
    expect(() => evaluatePromotionQuality({ ...input, cases: input.cases.map(c => ({ ...c, candidate: { ...counts, blockingTruePositives: 3 } })) })).toThrow();
  });
  it('parses external JSON and rejects missing, untyped and mismatched source inputs', () => {
    expect(parsePromotionQualityInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
    for (const invalid of [null, { ...input, candidateId: '' }, { ...input, artifactDigest: 'wrong' },
      { ...input, candidateExposure: { ...input.candidateExposure, caseIds: null } },
      { ...input, policy: { ...input.policy, minimumCases: '20' } },
      { ...input, cases: null }, { ...input, cases: [null] },
      { ...input, cases: input.cases.map(c => ({ ...c, fidelity: 'unknown' })) },
      { ...input, cases: input.cases.map(c => ({ ...c, observedAt: '2024-04-01T00:00:00.000Z' })) },
      { ...input, cases: input.cases.map(c => ({ ...c, ruleFamily: 'react' })) },
      { ...input, cases: input.cases.map(c => ({ ...c, executionSucceeded: 'yes' })) },
      { ...input, cases: input.cases.map(c => ({ ...c, candidate: { truePositives: 2 } })) },
    ]) expect(() => parsePromotionQualityInput(invalid)).toThrow();
  });
  it('checks candidate exposure inside the evaluator and does not promote synthetic source evidence', () => {
    expect(() => evaluatePromotionQuality({ ...input, candidateExposure: { ...input.candidateExposure, repositoryIds: ['repo-0'] } })).toThrow();
    expect(evaluatePromotionQuality({ ...input, cases: input.cases.map(c => ({ ...c, fidelity: 'synthetic' })) }).qualityStatus).toBe('insufficient-evidence');
    const noCritical = input.cases.map(c => ({ ...c, candidate: { ...counts, criticalPositiveExpected: 0, criticalPositiveDetected: 0 }, production: { ...counts, criticalPositiveExpected: 0, criticalPositiveDetected: 0 } }));
    expect(evaluatePromotionQuality({ ...input, cases: noCritical }).qualityStatus).toBe('insufficient-evidence');
  });
  it('rejects rates and counts outside domain, zero minima, and missing provenance', () => {
    for (const policy of [{ ...input.policy, minimumCases: 0 }, { ...input.policy, minimumRecall: -1 }, { ...input.policy, maximumRecallRegression: 2 }]) {
      expect(() => evaluatePromotionQuality({ ...input, policy })).toThrow();
    }
    for (const override of [{ snapshotRef: '' }, { adjudicationRef: '' }, { candidate: { ...counts, falsePositives: -1 } }]) {
      expect(() => evaluatePromotionQuality({ ...input, cases: input.cases.map(c => ({ ...c, ...override })) })).toThrow();
    }
  });
  it('computes a bounded Wilson interval with a missing denominator explicitly null', () => {
    expect(wilsonLowerBound(0, 0)).toBeNull();
    expect(wilsonLowerBound(0, 10)).toBe(0);
    expect(wilsonLowerBound(100, 100)).toBeCloseTo(0.963, 3);
    expect(() => wilsonLowerBound(11, 10)).toThrow();
  });
});
