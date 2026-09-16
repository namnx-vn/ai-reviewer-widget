import { describe, expect, it } from "vitest";
import { assessReviewerTrust, type ReviewerTrustInput } from "../trust-policy";

function input(): ReviewerTrustInput {
  return {
    ruleId: "security.test", ruleFamily: "security", severity: "high",
    policy: { version: "trust-1", minimumRepositories: 200, minimumFindings: 200,
      minimumBlockingPrecision: 0.98, minimumCommentPrecision: 0.9,
      maximumCalibrationError: 0.05, minimumCalibrationSamples: 200 },
    quality: { version: "quality-1", datasetVersion: "holdout-1", ruleFamily: "security", sourceVerified: true,
      pendingLabels: 0, truePositives: 200, falsePositives: 0,
      emittingRepositories: 200, cleanRepositories: 200,
      blockingTruePositives: 200, blockingFalsePositives: 0, blockingEmittingRepositories: 200, blockingCleanRepositories: 200 },
    calibration: { version: "calibration-1", datasetVersion: "holdout-1", ruleFamily: "security", scope: "blocking", sourceVerified: true,
      samples: 200, independentRepositories: 200, expectedCalibrationError: 0.02 },
    evidence: { contractVersion: "evidence-1", verified: true, contradictory: false },
  };
}

describe("centralized reviewer trust policy", () => {
  it("qualifies blocking from verified independent evidence and versioned calibration", () => {
    const result = assessReviewerTrust(input());
    expect(result.canBlock).toBe(true);
    expect(result.status).toBe("eligible");
    expect(result.basis).toBe("measured-quality");
    expect(result.repositoryReliabilityLowerBound).toBeGreaterThanOrEqual(0.98);
  });

  it("does not count correlated findings as independent blocking evidence", () => {
    const original = input();
    const result = assessReviewerTrust({ ...original,
      quality: { ...original.quality!, truePositives: 10_000, emittingRepositories: 1, cleanRepositories: 1,
        blockingEmittingRepositories: 1, blockingCleanRepositories: 1 },
    });
    expect(result.canBlock).toBe(false);
    expect(result.status).toBe("insufficient-evidence");
  });

  it("keeps unknown and unverified or mismatched calibration advisory", () => {
    const original = input();
    expect(assessReviewerTrust({ ...original, quality: undefined, calibration: undefined }).canBlock).toBe(false);
    expect(assessReviewerTrust({ ...original, quality: { ...original.quality!, sourceVerified: false } }).status)
      .toBe("insufficient-evidence");
    expect(assessReviewerTrust({ ...original, calibration: { ...original.calibration!, datasetVersion: "other" } }).canBlock)
      .toBe(false);
  });

  it("rejects high noise, bad calibration, or contradictory finding evidence", () => {
    const original = input();
    expect(assessReviewerTrust({ ...original, quality: { ...original.quality!, falsePositives: 10, cleanRepositories: 190,
      blockingFalsePositives: 10, blockingCleanRepositories: 190 } }).status)
      .toBe("ineligible");
    expect(assessReviewerTrust({ ...original, calibration: { ...original.calibration!, expectedCalibrationError: 0.2 } }).canBlock)
      .toBe(false);
    expect(assessReviewerTrust({ ...original, evidence: { ...original.evidence, contradictory: true } }).canBlock).toBe(false);
  });

  it("binds both quality and calibration to the evaluated family and blocking severity scope", () => {
    const original = input();
    expect(() => assessReviewerTrust({ ...original, quality: { ...original.quality!, ruleFamily: "react" } })).toThrow();
    expect(() => assessReviewerTrust({ ...original, calibration: { ...original.calibration!, ruleFamily: "react" } })).toThrow();
    expect(assessReviewerTrust({ ...original, calibration: { ...original.calibration!, scope: "comment" } }).canBlock).toBe(false);
  });

  it("does not hide blocking false positives behind thousands of advisory true positives", () => {
    const original = input();
    const report = assessReviewerTrust({ ...original, quality: { ...original.quality!,
      truePositives: 100_000, falsePositives: 10, blockingTruePositives: 200, blockingFalsePositives: 10,
      cleanRepositories: 190, blockingCleanRepositories: 190 },
    });
    expect(report.precision).toBeGreaterThan(0.99);
    expect(report.blockingPrecision).toBeLessThan(0.98);
    expect(report.canBlock).toBe(false);
  });

  it("records explicitly scoped mandatory governance separately from empirical qualification", () => {
    const original = input();
    const mandatoryException = { policyVersion: "org-policy-9", auditRef: "approval-12",
      reason: "Mandatory organization security policy", ruleIds: ["security.test"] };
    const result = assessReviewerTrust({ ...original, quality: undefined, calibration: undefined, mandatoryException });
    expect(result.canBlock).toBe(true);
    expect(result.status).toBe("mandatory-policy-exception");
    expect(result.exceptionAuditRef).toBe("approval-12");
    expect(result.repositoryReliabilityLowerBound).toBeNull();
    expect(assessReviewerTrust({ ...original, evidence: { ...original.evidence, verified: false }, mandatoryException }).canBlock)
      .toBe(false);
    expect(() => assessReviewerTrust({ ...original, mandatoryException: { ...mandatoryException, ruleIds: ["other"] } })).toThrow();
  });

  it("validates sample counts and policy rates rather than silently qualifying malformed metrics", () => {
    const original = input();
    expect(() => assessReviewerTrust({ ...original, quality: { ...original.quality!, cleanRepositories: 201 } })).toThrow();
    expect(() => assessReviewerTrust({ ...original, policy: { ...original.policy, minimumBlockingPrecision: Number.NaN } })).toThrow();
  });
});
