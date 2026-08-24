import type {
  ReviewFinding,
  ReviewResult,
  ReviewSecurityQualityGate,
  ReviewWarning,
  Severity,
} from "../../domain/review";

export interface SourceFile {
  readonly path: string;
  readonly content: string;
  readonly patch?: string;
  readonly changedLines?: readonly number[];
}

export interface DeterministicReviewResult {
  readonly findings: readonly ReviewFinding[];
  readonly warnings: readonly ReviewWarning[];
}

export interface DeterministicReviewPort {
  analyze(files: readonly SourceFile[]): DeterministicReviewResult;
}

export interface AIReviewRequest {
  readonly pullRequestTitle: string;
  readonly pullRequestDescription?: string;
  readonly diff: string;
  readonly deterministicFindings: string;
  readonly focus?: {
    readonly agent: "security" | "react" | "architecture";
    readonly role: string;
    readonly concerns: readonly string[];
  };
}

export interface AIReviewResponse {
  readonly findings: {
    readonly title: string;
    readonly message: string;
    readonly severity: Severity;
    readonly suggestion?: string;
    readonly confidence: number;
    readonly file?: string;
    readonly line?: number;
    readonly agent?: "security" | "react" | "architecture";
  }[];
  readonly warnings?: readonly {
    readonly code: "AI_AGENT_FAILED";
    readonly agent: "security" | "react" | "architecture";
    readonly message: string;
  }[];
}

export interface AIReviewerPort {
  readonly name: string;
  review(input: AIReviewRequest): Promise<AIReviewResponse>;
}

export interface PreparedAIReviewInput {
  readonly diff?: string;
  readonly title: string;
  readonly description?: string;
  readonly deterministicFindings: string;
  readonly omittedFiles: number;
  readonly redactedValues: number;
  readonly truncated: boolean;
}

export interface ReviewPipelineInput {
  readonly deterministicFindings: ReviewFinding[];
  readonly aiReviewer?: AIReviewerPort;
  readonly aiInput?: AIReviewRequest;
  readonly warnings: readonly ReviewWarning[];
}

export interface ReviewPipelinePort {
  execute(input: ReviewPipelineInput): Promise<ReviewResult>;
}

export interface ReviewPublisherPort<TOutput = void> {
  publish(result: ReviewResult): Promise<TOutput>;
}

export type SecurityProfileId =
  | "security/default"
  | "security/strict"
  | "security/financial"
  | "security/banking";

export interface SecurityQualityGateSuppression {
  readonly findingId?: string;
  readonly ruleId?: string;
  readonly reason: string;
  readonly owner?: string;
  readonly expiresAt?: string;
}

export interface SecurityQualityGateRequest {
  readonly profile?: SecurityProfileId;
  readonly evaluatedAt: string;
  readonly baselineFindingIds?: readonly string[];
  readonly suppressions?: readonly SecurityQualityGateSuppression[];
}

export interface QualityGateEvaluation extends ReviewSecurityQualityGate {
  readonly findings: readonly {
    readonly findingId: string;
    readonly state: "new" | "baseline" | "suppressed" | "ignored";
  }[];
}

export interface QualityGateInput extends SecurityQualityGateRequest {
  readonly findings: readonly ReviewFinding[];
  readonly baselineFindingIds: readonly string[];
  readonly profile: SecurityProfileId;
}

export type QualityGateEvaluator = (input: QualityGateInput) => QualityGateEvaluation;

export interface ReviewApplicationDependencies {
  readonly deterministic: DeterministicReviewPort;
  readonly pipeline: ReviewPipelinePort;
  readonly prepareAIInput: (input: {
    readonly title: string;
    readonly description?: string;
    readonly deterministicFindings: string;
    readonly files: readonly SourceFile[];
  }) => PreparedAIReviewInput;
  readonly evaluateQualityGate: QualityGateEvaluator;
  readonly now: () => number;
}
