import type {
  Severity,
} from "../review/types";

export interface AIReviewInput {
  pullRequestTitle: string;

  pullRequestDescription?: string;

  diff: string;

  deterministicFindings: string;
}

export interface AIReviewFinding {
  title: string;

  message: string;

  severity: Severity;

  suggestion?: string;

  confidence: number;

  file?: string;

  line?: number;
}

export interface AIReviewResult {
  findings: AIReviewFinding[];
}

export interface AIProvider {
  readonly name: string;

  review(
    input: AIReviewInput,
  ): Promise<AIReviewResult>;
}