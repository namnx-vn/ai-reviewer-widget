export interface AIReviewInput {
  pullRequestTitle: string;

  pullRequestDescription?: string;

  diff: string;

  deterministicFindings: string;
}

export interface AIReviewResult {
  findings: Array<{
    title: string;

    message: string;

    severity: "critical" | "high" | "medium" | "low" | "info";

    suggestion?: string;

    confidence?: number;
  }>;
}

export interface AIProvider {
  review(input: AIReviewInput): Promise<AIReviewResult>;
}

export interface PromptCache {
  get(key: string): Promise<AIReviewResult | null>;

  set(key: string, value: AIReviewResult): Promise<void>;
}
