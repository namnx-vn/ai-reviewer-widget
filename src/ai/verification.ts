import type { ReviewFinding } from "../domain/review";
import type { AIReviewFinding } from "./types";

export type AIEvidenceStatus = "supported" | "unsupported" | "unverifiable";

export interface AIFindingEvidence {
  readonly status: AIEvidenceStatus;
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
    return findings.map((finding) => ({
      ...finding,
      evidence: { status: "unverifiable", provenance: [] },
    }));
  }
}

function verifyFinding(
  finding: AIReviewFinding,
  deterministicFindings: readonly ReviewFinding[],
  knownFiles: ReadonlySet<string>,
): VerifiedAIReviewFinding {
  if (finding.file === undefined) {
    return { ...finding, evidence: { status: "unverifiable", provenance: [] } };
  }
  const file = normalizePath(finding.file);
  if (!knownFiles.has(file)) {
    return {
      ...finding,
      confidence: Math.min(finding.confidence, 0.4),
      evidence: {
        status: "unsupported",
        provenance: [],
      },
    };
  }

  const deterministic = deterministicFindings.find((candidate) => {
    if (normalizePath(candidate.location?.file ?? "") !== file) return false;
    if (finding.line === undefined || candidate.location?.line === undefined) return true;
    return Math.abs(candidate.location.line - finding.line) <= 1;
  });
  if (deterministic === undefined) {
    return {
      ...finding,
      evidence: {
        status: "unverifiable",
        provenance: [{ kind: "repository-file", reference: file }],
      },
    };
  }

  return {
    ...finding,
    confidence: Math.max(finding.confidence, Math.min(1, deterministic.confidence)),
    evidence: {
      status: "supported",
      provenance: [
        { kind: "repository-file", reference: file },
        { kind: "deterministic-finding", reference: deterministic.id },
      ],
    },
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}
