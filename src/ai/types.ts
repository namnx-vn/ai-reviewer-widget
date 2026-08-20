import type {
  Severity,
} from "../review/types";

export type AIReviewAgentId =
  | "security"
  | "react"
  | "architecture";

export interface AIReviewFocus {
  readonly agent: AIReviewAgentId;

  readonly role: string;

  readonly concerns: readonly string[];
}

export interface AIReviewInput {
  pullRequestTitle: string;

  pullRequestDescription?: string;

  diff: string;

  deterministicFindings: string;

  focus?: AIReviewFocus;
}

export interface AIReviewFinding {
  title: string;

  message: string;

  severity: Severity;

  suggestion?: string;

  confidence: number;

  file?: string;

  line?: number;

  agent?: AIReviewAgentId;
}

export interface AIReviewWarning {
  readonly code: "AI_AGENT_FAILED";

  readonly agent: AIReviewAgentId;

  readonly message: string;
}

export interface AIReviewResult {
  findings: AIReviewFinding[];

  warnings?: readonly AIReviewWarning[];
}

export interface AIProvider {
  readonly name: string;

  review(
    input: AIReviewInput,
  ): Promise<AIReviewResult>;
}
