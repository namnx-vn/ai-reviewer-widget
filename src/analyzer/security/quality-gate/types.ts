import type { SecurityConfidence, SecuritySeverity } from "../model/types";
import type { ResolvedSecurityProfile, SecurityProfileId } from "../policies";

export type SecurityQualityGateDecision = "pass" | "warn" | "fail";

export type SecurityQualityGateAction =
  | "fail"
  | "warn"
  | "report"
  | "baseline"
  | "suppress"
  | "ignore";

export type SecurityQualityGateFindingState =
  | "new"
  | "baseline"
  | "suppressed"
  | "ignored";

export type SecurityQualityGateReasonCode =
  | "mandatory-rule"
  | "blocking-severity"
  | "advisory-severity"
  | "report-only-severity"
  | "baseline-existing-debt"
  | "active-suppression"
  | "profile-disabled"
  | "below-profile-confidence"
  | "below-gate-confidence";

export interface SecurityQualityGateFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: SecuritySeverity;
  readonly confidence: SecurityConfidence;
}

export interface SecurityQualityGateSuppression {
  readonly findingId?: string;
  readonly ruleId?: string;
  readonly reason: string;
  readonly owner?: string;
  readonly expiresAt?: string;
}

export interface SecurityQualityGateSeverityAction {
  readonly severity: SecuritySeverity;
  readonly action: "fail" | "warn" | "report";
}

export interface SecurityQualityGateInput {
  readonly findings: readonly SecurityQualityGateFinding[];
  readonly profile: SecurityProfileId | ResolvedSecurityProfile;
  readonly evaluatedAt: string;
  readonly baselineFindingIds?: readonly string[];
  readonly suppressions?: readonly SecurityQualityGateSuppression[];
  readonly severityActions?: readonly SecurityQualityGateSeverityAction[];
}

export interface SecurityQualityGateReason {
  readonly code: SecurityQualityGateReasonCode;
  readonly findingId: string;
  readonly ruleId: string;
  readonly message: string;
}

export interface SecurityQualityGateFindingResult {
  readonly findingId: string;
  readonly ruleId: string;
  readonly state: SecurityQualityGateFindingState;
  readonly action: SecurityQualityGateAction;
  readonly effectiveSeverity: SecuritySeverity;
  readonly confidence: SecurityConfidence;
  readonly reasonCode: SecurityQualityGateReasonCode;
}

export interface SecurityQualityGateSuppressionAudit {
  readonly findingId?: string;
  readonly ruleId?: string;
  readonly reason: string;
  readonly owner?: string;
  readonly expiresAt?: string;
  readonly expired: boolean;
  readonly matchedFindingIds: readonly string[];
}

export interface SecurityQualityGateSummary {
  readonly total: number;
  readonly evaluated: number;
  readonly newFindings: number;
  readonly baseline: number;
  readonly suppressed: number;
  readonly ignored: number;
  readonly blocking: number;
  readonly warnings: number;
  readonly reported: number;
}

export interface SecurityQualityGateResult {
  readonly decision: SecurityQualityGateDecision;
  readonly profileId: string;
  readonly evaluatedAt: string;
  readonly reasons: readonly SecurityQualityGateReason[];
  readonly findings: readonly SecurityQualityGateFindingResult[];
  readonly suppressions: readonly SecurityQualityGateSuppressionAudit[];
  readonly summary: SecurityQualityGateSummary;
}
