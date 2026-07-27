import type {
  SecurityCategory,
  SecurityConfidence,
  SecuritySeverity,
} from "../model/types";
import {
  getSecurityProfile,
  resolveSecurityRulePolicy,
  type ResolvedSecurityProfile,
} from "../policies";
import type {
  SecurityQualityGateAction,
  SecurityQualityGateCategoryAction,
  SecurityQualityGateFinding,
  SecurityQualityGateFindingResult,
  SecurityQualityGateInput,
  SecurityQualityGateReason,
  SecurityQualityGateReasonCode,
  SecurityQualityGateResult,
  SecurityQualityGateSeverityAction,
  SecurityQualityGateSuppression,
  SecurityQualityGateSuppressionAudit,
  SecurityQualityGateSummary,
} from "./types";

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

type DecisionAction = "fail" | "warn" | "report";

export function evaluateSecurityQualityGate(
  input: SecurityQualityGateInput,
): SecurityQualityGateResult {
  const evaluatedAtMs = parseTimestamp(input.evaluatedAt, "evaluatedAt");
  const profile = typeof input.profile === "string"
    ? getSecurityProfile(input.profile)
    : input.profile;
  const baseline = new Set(input.baselineFindingIds ?? []);
  const severityActions = createSeverityActionMap(input.severityActions ?? []);
  const categoryActions = createCategoryActionMap(input.categoryActions ?? []);
  const suppressions = prepareSuppressions(input.suppressions ?? [], evaluatedAtMs);
  const findings = [...input.findings].sort(compareFindings);
  const findingResults = findings.map((finding) => evaluateFinding(
    finding,
    profile,
    baseline,
    severityActions,
    categoryActions,
    suppressions,
  ));
  const reasons = findingResults.map(toReason);
  const suppressionAudit = createSuppressionAudit(suppressions, findings);
  const summary = summarize(findingResults);

  return {
    decision: decisionFromSummary(summary),
    profileId: profile.id,
    evaluatedAt: input.evaluatedAt,
    reasons,
    findings: findingResults,
    suppressions: suppressionAudit,
    summary,
  };
}

interface PreparedSuppression {
  readonly value: SecurityQualityGateSuppression;
  readonly expired: boolean;
}

function evaluateFinding(
  finding: SecurityQualityGateFinding,
  profile: ResolvedSecurityProfile,
  baseline: ReadonlySet<string>,
  severityActions: ReadonlyMap<SecuritySeverity, DecisionAction>,
  categoryActions: ReadonlyMap<SecurityCategory, DecisionAction>,
  suppressions: readonly PreparedSuppression[],
): SecurityQualityGateFindingResult {
  validateFinding(finding);
  const rulePolicy = resolveSecurityRulePolicy(finding.ruleId, finding.severity, profile);

  if (!rulePolicy.enabled) {
    return result(finding, "ignored", "ignore", rulePolicy.severity, "profile-disabled");
  }
  if (confidenceRank(finding.confidence) < confidenceRank(rulePolicy.minimumConfidence)) {
    return result(finding, "ignored", "ignore", rulePolicy.severity, "below-profile-confidence");
  }

  const gateMinimumConfidence = profile.qualityGate.minimumConfidence ?? profile.minimumConfidence;
  if (confidenceRank(finding.confidence) < confidenceRank(gateMinimumConfidence)) {
    return result(finding, "ignored", "ignore", rulePolicy.severity, "below-gate-confidence");
  }

  const activeSuppression = suppressions.find(
    (suppression) => !suppression.expired && matchesSuppression(finding, suppression.value),
  );
  if (activeSuppression !== undefined) {
    return result(finding, "suppressed", "suppress", rulePolicy.severity, "active-suppression");
  }

  if (baseline.has(finding.id)) {
    return result(finding, "baseline", "baseline", rulePolicy.severity, "baseline-existing-debt");
  }

  const mandatoryRuleIds = profile.qualityGate.mandatoryRuleIds ?? [];
  if (mandatoryRuleIds.includes(finding.ruleId)) {
    return result(finding, "new", "fail", rulePolicy.severity, "mandatory-rule");
  }

  const failOnSeverities = profile.qualityGate.failOnSeverities ?? [];
  if (failOnSeverities.includes(rulePolicy.severity)) {
    return result(finding, "new", "fail", rulePolicy.severity, "blocking-severity");
  }

  const categoryAction = finding.category === undefined
    ? undefined
    : categoryActions.get(finding.category);
  if (categoryAction !== undefined) {
    return result(finding, "new", categoryAction, rulePolicy.severity, "category-policy");
  }

  const action = severityActions.get(rulePolicy.severity) ?? defaultSeverityAction(rulePolicy.severity);
  return result(
    finding,
    "new",
    action,
    rulePolicy.severity,
    action === "warn" ? "advisory-severity" : action === "report" ? "report-only-severity" : "blocking-severity",
  );
}

function result(
  finding: SecurityQualityGateFinding,
  state: SecurityQualityGateFindingResult["state"],
  action: SecurityQualityGateAction,
  effectiveSeverity: SecuritySeverity,
  reasonCode: SecurityQualityGateReasonCode,
): SecurityQualityGateFindingResult {
  return {
    findingId: finding.id,
    ruleId: finding.ruleId,
    state,
    action,
    effectiveSeverity,
    confidence: finding.confidence,
    category: finding.category,
    reasonCode,
  };
}

function toReason(item: SecurityQualityGateFindingResult): SecurityQualityGateReason {
  return {
    code: item.reasonCode,
    findingId: item.findingId,
    ruleId: item.ruleId,
    message: reasonMessage(item),
  };
}

function reasonMessage(item: SecurityQualityGateFindingResult): string {
  if (item.reasonCode === "mandatory-rule") {
    return `New finding ${item.ruleId} is mandatory for the active security profile.`;
  }
  if (item.reasonCode === "blocking-severity") {
    return `New ${item.effectiveSeverity} finding ${item.ruleId} blocks the security quality gate.`;
  }
  if (item.reasonCode === "category-policy") {
    return `New ${item.effectiveSeverity} finding ${item.ruleId} follows the configured ${item.category ?? "unknown"} category action.`;
  }
  if (item.reasonCode === "advisory-severity") {
    return `New ${item.effectiveSeverity} finding ${item.ruleId} requires review.`;
  }
  if (item.reasonCode === "report-only-severity") {
    return `New ${item.effectiveSeverity} finding ${item.ruleId} is report-only.`;
  }
  if (item.reasonCode === "baseline-existing-debt") {
    return `Finding ${item.ruleId} matches the supplied baseline and does not block adoption.`;
  }
  if (item.reasonCode === "active-suppression") {
    return `Finding ${item.ruleId} is covered by an explicit active suppression.`;
  }
  if (item.reasonCode === "profile-disabled") {
    return `Finding ${item.ruleId} is disabled by the active security profile.`;
  }
  if (item.reasonCode === "below-profile-confidence") {
    return `Finding ${item.ruleId} is below the rule/profile confidence threshold.`;
  }
  return `Finding ${item.ruleId} is below the quality-gate confidence threshold.`;
}

function createSeverityActionMap(
  actions: readonly SecurityQualityGateSeverityAction[],
): ReadonlyMap<SecuritySeverity, DecisionAction> {
  const result = new Map<SecuritySeverity, DecisionAction>();
  for (const item of actions) {
    if (result.has(item.severity)) {
      throw new Error(`Duplicate security quality-gate action for severity "${item.severity}".`);
    }
    result.set(item.severity, item.action);
  }
  return result;
}

function createCategoryActionMap(
  actions: readonly SecurityQualityGateCategoryAction[],
): ReadonlyMap<SecurityCategory, DecisionAction> {
  const result = new Map<SecurityCategory, DecisionAction>();
  for (const item of actions) {
    if (result.has(item.category)) {
      throw new Error(`Duplicate security quality-gate action for category "${item.category}".`);
    }
    result.set(item.category, item.action);
  }
  return result;
}

function defaultSeverityAction(severity: SecuritySeverity): DecisionAction {
  if (severity === "critical") return "fail";
  if (severity === "high" || severity === "medium") return "warn";
  return "report";
}

function prepareSuppressions(
  suppressions: readonly SecurityQualityGateSuppression[],
  evaluatedAtMs: number,
): readonly PreparedSuppression[] {
  return [...suppressions]
    .map((value) => {
      validateSuppression(value);
      const expiresAtMs = value.expiresAt === undefined
        ? undefined
        : parseTimestamp(value.expiresAt, "suppression expiresAt");
      return {
        value,
        expired: expiresAtMs !== undefined && evaluatedAtMs >= expiresAtMs,
      };
    })
    .sort((left, right) => suppressionKey(left.value).localeCompare(suppressionKey(right.value)));
}

function validateSuppression(suppression: SecurityQualityGateSuppression): void {
  if (suppression.findingId === undefined && suppression.ruleId === undefined) {
    throw new Error("Security quality-gate suppression requires findingId or ruleId.");
  }
  if (suppression.reason.trim().length === 0) {
    throw new Error("Security quality-gate suppression requires a non-empty reason.");
  }
}

function matchesSuppression(
  finding: SecurityQualityGateFinding,
  suppression: SecurityQualityGateSuppression,
): boolean {
  if (suppression.findingId !== undefined && suppression.findingId !== finding.id) return false;
  if (suppression.ruleId !== undefined && suppression.ruleId !== finding.ruleId) return false;
  return true;
}

function createSuppressionAudit(
  suppressions: readonly PreparedSuppression[],
  findings: readonly SecurityQualityGateFinding[],
): readonly SecurityQualityGateSuppressionAudit[] {
  return suppressions.map(({ value, expired }) => ({
    findingId: value.findingId,
    ruleId: value.ruleId,
    reason: value.reason,
    owner: value.owner,
    expiresAt: value.expiresAt,
    expired,
    matchedFindingIds: findings
      .filter((finding) => matchesSuppression(finding, value))
      .map((finding) => finding.id)
      .sort(),
  }));
}

function summarize(
  findings: readonly SecurityQualityGateFindingResult[],
): SecurityQualityGateSummary {
  return {
    total: findings.length,
    evaluated: findings.filter((finding) => finding.state !== "ignored").length,
    newFindings: findings.filter((finding) => finding.state === "new").length,
    baseline: findings.filter((finding) => finding.state === "baseline").length,
    suppressed: findings.filter((finding) => finding.state === "suppressed").length,
    ignored: findings.filter((finding) => finding.state === "ignored").length,
    blocking: findings.filter((finding) => finding.action === "fail").length,
    warnings: findings.filter((finding) => finding.action === "warn").length,
    reported: findings.filter((finding) => finding.action === "report").length,
  };
}

function decisionFromSummary(summary: SecurityQualityGateSummary): SecurityQualityGateResult["decision"] {
  if (summary.blocking > 0) return "fail";
  if (summary.warnings > 0) return "warn";
  return "pass";
}

function validateFinding(finding: SecurityQualityGateFinding): void {
  if (finding.id.trim().length === 0) throw new Error("Security quality-gate finding id must not be empty.");
  if (finding.ruleId.trim().length === 0) throw new Error("Security quality-gate rule id must not be empty.");
}

function parseTimestamp(value: string, label: string): number {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} timestamp "${value}".`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} timestamp "${value}".`);
  return parsed;
}

function suppressionKey(suppression: SecurityQualityGateSuppression): string {
  return [
    suppression.findingId ?? "",
    suppression.ruleId ?? "",
    suppression.reason,
    suppression.owner ?? "",
    suppression.expiresAt ?? "",
  ].join(":");
}

function compareFindings(left: SecurityQualityGateFinding, right: SecurityQualityGateFinding): number {
  return left.id.localeCompare(right.id) || left.ruleId.localeCompare(right.ruleId);
}

function confidenceRank(confidence: SecurityConfidence): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}
