import { aggregateReview, assessReviewerTrust, type ReviewFinding, type ReviewResult,
  type ReviewerTrustInput, type ReviewerTrustResult, type ReviewWarning } from "../../domain/review";
import { verifyFindingCandidate, type CounterexampleRegistry, type FindingVerificationContext,
  type FindingVerificationResult } from "./finding-verification";
import type { SourceFile } from "./ports";
import type { ReviewUseCases } from "./use-cases";

export interface FindingReliabilityAssessment {
  readonly findingId: string;
  readonly ruleId: string;
  readonly verification: FindingVerificationResult;
  readonly trust: ReviewerTrustResult | null;
}
export interface ReliableReviewResult extends ReviewResult {
  readonly findingVerification: readonly FindingReliabilityAssessment[];
}
export interface ReliableReviewUseCases extends ReviewUseCases {
  reviewFiles(...args: Parameters<ReviewUseCases["reviewFiles"]>): ReliableReviewResult;
  reviewPullRequest(...args: Parameters<ReviewUseCases["reviewPullRequest"]>): Promise<ReliableReviewResult>;
}
export interface ReliableReviewOptions {
  readonly useCases: ReviewUseCases;
  /** Trusted analyzer facts, not AI/repository-provided attestations or developer labels. */
  readonly evidence: (finding: ReviewFinding, files: readonly SourceFile[]) => {
    readonly graph?: unknown;
    readonly trustedEvidenceNodes: FindingVerificationContext["trustedEvidenceNodes"];
  };
  /** Trusted governance/evaluator composition supplies versioned, scoped measurement inputs. */
  readonly trust: (finding: ReviewFinding, evidenceVerified: boolean) => ReviewerTrustInput;
  readonly counterexamples?: CounterexampleRegistry;
  readonly mandatoryRuleIds?: readonly string[];
}

/** An explicit reliability mode on the shared pipeline; feedback cannot activate or configure it. */
export function createReliableReviewUseCases(options: ReliableReviewOptions): ReliableReviewUseCases {
  function guard(result: ReviewResult, files: readonly SourceFile[]): ReliableReviewResult {
    const startedAt = performance.now();
    const findings: ReviewFinding[] = [];
    const assessments: FindingReliabilityAssessment[] = [];
    const warnings: ReviewWarning[] = [...result.warnings];
    let mandatoryUnverified = options.mandatoryRuleIds !== undefined
      && options.mandatoryRuleIds.length > 0
      && result.warnings.some((warning) => [
        "SOURCE_PARSE_FAILED",
        "ANALYZER_CONTRIBUTION_FAILED",
        "SECURITY_RULE_FAILED",
        "REACT_RULE_FAILED",
      ].includes(warning.code));
    for (const original of result.findings) {
      const finding = structuredClone(original);
      const mandatory = options.mandatoryRuleIds?.includes(finding.ruleId) === true;
      try {
        const facts = options.evidence(structuredClone(finding), files);
        const verification = verifyFindingCandidate({ finding, graph: facts.graph }, {
          knownFiles: files.map((file) => file.path), trustedEvidenceNodes: facts.trustedEvidenceNodes,
          counterexamples: options.counterexamples ?? [], mandatoryRuleIds: options.mandatoryRuleIds,
        });
        const verified = verification.action === "publish";
        const trustInput = options.trust(structuredClone(finding), verified);
        if (trustInput.ruleId !== finding.ruleId || trustInput.severity !== finding.severity
          || trustInput.evidence.verified !== verified || trustInput.evidence.contradictory !== verification.reasons.includes("claim-contradicted")) {
          throw new Error("Trust receipt is not bound to the verified finding.");
        }
        const trust = assessReviewerTrust(trustInput);
        assessments.push({ findingId: finding.id, ruleId: finding.ruleId, verification, trust });
        if (mandatory && !verified) mandatoryUnverified = true;
        if (verification.finding !== undefined) {
          const maySurface = trust.canBlock || (finding.severity !== "critical" && finding.severity !== "high" && trust.canComment);
          if (mandatory && !maySurface) mandatoryUnverified = true;
          findings.push(maySurface && verified ? verification.finding : advisory(verification.finding));
          if (!maySurface || !verified) warnings.push({ code: "FINDING_TRUST_INSUFFICIENT",
            message: `Finding ${finding.id} remains advisory: ${trust.status}; ${verification.reasons.join(",")}.` });
        }
      } catch {
        mandatoryUnverified = mandatoryUnverified || mandatory;
        findings.push(advisory(finding));
        assessments.push({ findingId: finding.id, ruleId: finding.ruleId, verification: {
          action: "downgrade", finding: advisory(finding), reasons: ["reliability-port-failed"] }, trust: null });
        warnings.push({ code: "FINDING_VERIFICATION_FAILED", message: `Reliability verification was unavailable for finding ${finding.id}.` });
      }
    }
    if (mandatoryUnverified) warnings.push({ code: "FINDING_VERIFICATION_FAILED", message: "Mandatory controls could not be verified; review fails closed." });
    const aggregated = aggregateReview(findings, result.durationMs + performance.now() - startedAt, warnings);
    return { ...aggregated, securityQualityGate: result.securityQualityGate,
      decision: mandatoryUnverified || result.securityQualityGate?.decision === "fail" ? "FAIL" : aggregated.decision,
      findingVerification: assessments };
  }
  return {
    reviewFiles(files, ...args) { return guard(options.useCases.reviewFiles(files, ...args), files); },
    async reviewPullRequest(input, reviewer) { return guard(await options.useCases.reviewPullRequest(input, reviewer), input.files); },
  };
}
function advisory(finding: ReviewFinding): ReviewFinding {
  return { ...finding, severity: "info", confidence: Number.isFinite(finding.confidence) ? Math.min(0.4, Math.max(0, finding.confidence)) : 0 };
}
