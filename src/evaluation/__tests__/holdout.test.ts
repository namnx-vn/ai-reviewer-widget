import { describe, expect, it } from 'vitest';
import { assertCandidateHoldoutIsolation, validateHoldoutManifest } from '../holdout';

export const manifest = {
  schemaVersion: '1', manifestId: 'holdout-v1',
  development: [{ caseId: 'dev', repositoryId: 'repo-dev', observedAt: '2024-01-01T00:00:00.000Z' }],
  calibration: [{ caseId: 'cal', repositoryId: 'repo-cal', observedAt: '2024-02-01T00:00:00.000Z' }],
  protectedHoldout: [{ caseId: 'test', repositoryId: 'repo-test', observedAt: '2024-03-01T00:00:00.000Z' }],
};

describe('protected holdout', () => {
  it('accepts strictly separated cohorts and isolated exposure', () => {
    const parsed = validateHoldoutManifest(manifest);
    expect(parsed).toEqual(manifest);
    expect(() => assertCandidateHoldoutIsolation(parsed, {
      caseIds: ['dev'], repositoryIds: ['repo-dev'], trainedThrough: '2024-02-01T00:00:00.000Z',
    })).not.toThrow();
  });
  it.each([
    { ...manifest, calibration: [{ ...manifest.calibration[0], caseId: 'dev' }] },
    { ...manifest, protectedHoldout: [{ ...manifest.protectedHoldout[0], repositoryId: 'repo-cal' }] },
    { ...manifest, calibration: [{ ...manifest.calibration[0], observedAt: '2024-03-02T00:00:00.000Z' }] },
    { ...manifest, development: [{ ...manifest.development[0], observedAt: '2024-02-30T00:00:00.000Z' }] },
    { ...manifest, protectedHoldout: [] },
    null,
  ])('rejects invalid or contaminated manifests', (input) => {
    expect(() => validateHoldoutManifest(input)).toThrow();
  });
  it.each([
    { caseIds: ['test'], repositoryIds: [], trainedThrough: '2024-02-01T00:00:00.000Z' },
    { caseIds: [], repositoryIds: ['repo-test'], trainedThrough: '2024-02-01T00:00:00.000Z' },
    { caseIds: [], repositoryIds: [], trainedThrough: '2024-03-01T00:00:00.000Z' },
    { caseIds: ['unknown'], repositoryIds: [], trainedThrough: 'bad' },
  ])('rejects exposed holdout or invalid training provenance', (exposure) => {
    expect(() => assertCandidateHoldoutIsolation(validateHoldoutManifest(manifest), exposure)).toThrow();
  });
});
