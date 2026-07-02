import type {
  AIProvider,
  AIReviewInput,
  AIReviewResult,
} from "./types";

export interface AIProviderConfig {
  apiKey: string;

  model: string;

  baseUrl: string;
}

export abstract class BaseAIProvider
  implements AIProvider
{
  abstract readonly name: string;

  constructor(
    protected readonly config: AIProviderConfig,
  ) {}

  abstract review(
    input: AIReviewInput,
  ): Promise<AIReviewResult>;
}