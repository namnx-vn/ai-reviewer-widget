import type { PromotionQualityPolicy } from "../evaluation";

/** Approved operator policy. A bundle cannot redefine these floors under the same version. */
export const APPROVED_PROMOTION_POLICY: Readonly<PromotionQualityPolicy> = Object.freeze({
  policyVersion: "phase-7-trust-v1",
  minimumCases: 100,
  minimumRepositories: 15,
  minimumPrecisionRepositories: 75,
  minimumBlockingPrecisionRepositories: 190,
  minimumPositiveExpectations: 50,
  minimumProtectedPositiveExpectations: 20,
  minimumCriticalPositiveExpectations: 10,
  minimumNegativeControls: 40,
  minimumPrecision: 0.95,
  minimumBlockingPrecision: 0.98,
  minimumRecall: 0.9,
  maximumRecallRegression: 0,
  maximumNegativeControlFalsePositives: 0,
});

export function assertApprovedPromotionPolicy(
  policy: PromotionQualityPolicy,
  approved: Readonly<PromotionQualityPolicy> = APPROVED_PROMOTION_POLICY,
): void {
  if (!Object.entries(approved).every(([key, value]) => Object.entries(policy).some(([actualKey, actualValue]) => actualKey === key && actualValue === value))) {
    throw new Error("Evaluation policy does not match the approved immutable promotion policy.");
  }
}
