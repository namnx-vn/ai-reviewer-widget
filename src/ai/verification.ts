import type { ReviewFinding, ReviewFindingEvidence } from "../domain/review";
import type { AIReviewFinding } from "./types";

export type AIEvidenceStatus = "supported" | "unsupported" | "unverifiable";
export type AIVerificationReason = NonNullable<ReviewFindingEvidence["reason"]>;

export interface AIFindingEvidence {
  readonly status: AIEvidenceStatus;
  readonly reason: AIVerificationReason;
  readonly provenance: readonly {
    readonly kind: "deterministic-finding" | "repository-file";
    readonly reference: string;
  }[];
}

export interface AIFindingVerificationContext {
  readonly deterministicFindings: readonly ReviewFinding[];
  readonly knownFiles: readonly string[];
}

export interface VerifiedAIReviewFinding extends AIReviewFinding {
  readonly evidence: AIFindingEvidence;
}

export function verifyAIFindings(
  findings: readonly AIReviewFinding[],
  context: AIFindingVerificationContext,
): readonly VerifiedAIReviewFinding[] {
  try {
    const knownFiles = new Set(context.knownFiles.map(normalizePath));
    return findings.map((finding) => verifyFinding(finding, context.deterministicFindings, knownFiles));
  } catch {
    return findings.map((finding) => advisory(finding, "unverifiable", "verification-failed", []));
  }
}

function verifyFinding(
  finding: AIReviewFinding,
  deterministicFindings: readonly ReviewFinding[],
  knownFiles: ReadonlySet<string>,
): VerifiedAIReviewFinding {
  if (finding.file === undefined || !isPositiveLine(finding.line)) {
    return advisory(finding, "unverifiable", "missing-location", []);
  }
  const file = normalizePath(finding.file);
  if (!knownFiles.has(file)) return advisory(finding, "unsupported", "unknown-file", []);
  const provenance = [{ kind: "repository-file" as const, reference: file }];
  const claim = finding.verificationClaim;
  if (claim === undefined) return advisory(finding, "unverifiable", "missing-claim", provenance);

  const matching = deterministicFindings.filter((candidate) =>
    candidate.id === claim.deterministicFindingId && candidate.ruleId === claim.ruleId &&
    normalizePath(candidate.location?.file ?? "") === file &&
    isPositiveLine(candidate.location?.line) && candidate.location?.line === finding.line,
  );
  if (matching.length !== 1) return advisory(finding, "unsupported", "claim-mismatch", provenance);
  const deterministic = matching[0];
  if (deterministic.source === "ai" ||
    (deterministic.evidence !== undefined && deterministic.evidence.status !== "supported")) {
    return advisory(finding, "unsupported", "contradictory-detector", provenance);
  }
  // A named detector verifies only its own conclusion. Untrusted prose and
  // remediation cannot inherit support by pointing at an unrelated warning.
  // Detector certainty is not an empirical probability of bug correctness.
  return {
    ...finding,
    file: deterministic.location?.file ?? file,
    title: deterministic.title,
    message: deterministic.message,
    severity: deterministic.severity,
    suggestion: deterministic.suggestion,
    confidence: Math.min(boundedConfidence(finding.confidence), boundedConfidence(deterministic.confidence), 0.99),
    evidence: {
      status: "supported",
      reason: "canonical-detector-match",
      provenance: [...provenance, {
        kind: "deterministic-finding",
        reference: `${deterministic.ruleId}@${file}:${finding.line}`,
      }],
    },
  };
}

function advisory(
  finding: AIReviewFinding,
  status: "unsupported" | "unverifiable",
  reason: AIVerificationReason,
  provenance: AIFindingEvidence["provenance"],
): VerifiedAIReviewFinding {
  return {
    ...finding,
    severity: "info",
    confidence: Math.min(boundedConfidence(finding.confidence), 0.4),
    evidence: { status, reason, provenance },
  };
}

function boundedConfidence(confidence: number): number {
  return Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
}

function isPositiveLine(line: number | undefined): line is number {
  return line !== undefined && Number.isSafeInteger(line) && line > 0;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}
