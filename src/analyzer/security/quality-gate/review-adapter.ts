import type { ReviewFinding } from "../../../review/types";
import type { SecurityConfidence } from "../model/types";
import { evaluateSecurityQualityGate } from "./quality-gate";
import type {
  SecurityQualityGateFinding,
  SecurityQualityGateInput,
  SecurityQualityGateResult,
} from "./types";

export type SecurityReviewQualityGateInput = Omit<SecurityQualityGateInput, "findings"> & {
  readonly findings: readonly ReviewFinding[];
};

export function evaluateSecurityReviewQualityGate(
  input: SecurityReviewQualityGateInput,
): SecurityQualityGateResult {
  return evaluateSecurityQualityGate({
    profile: input.profile,
    evaluatedAt: input.evaluatedAt,
    baselineFindingIds: input.baselineFindingIds,
    suppressions: input.suppressions,
    severityActions: input.severityActions,
    findings: toSecurityQualityGateFindings(input.findings),
  });
}

export function toSecurityQualityGateFindings(
  findings: readonly ReviewFinding[],
): readonly SecurityQualityGateFinding[] {
  return findings
    .filter((finding) => finding.source === "security")
    .map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      severity: finding.severity,
      confidence: confidenceFromScore(finding.confidence),
    }));
}

function confidenceFromScore(score: number): SecurityConfidence {
  if (score >= 0.9) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}
