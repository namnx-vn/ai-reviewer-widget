export interface ReviewConfig {
  ai: {
    enabled: boolean;

    provider:
      | "openai"
      | "claude"
      | "gemini";

    model: string;

    minConfidence: number;
  };

  rules: {
    enabled: string[];
  };

  scoring: {
    pass: number;

    warn: number;
  };
}