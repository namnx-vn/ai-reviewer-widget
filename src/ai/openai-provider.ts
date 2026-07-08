import {
  BaseAIProvider,
} from "./provider";

import type {
  AIProviderConfig,
} from "./provider";

import type {
  AIReviewInput,
  AIReviewResult,
} from "./types";

import {
  buildReviewPrompt,
} from "./prompts";

import {
  parseAIResult,
} from "./parser";

import {
  type RetryOptions,
  withRetry,
} from "./retry";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

class OpenAIRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class OpenAIProvider
  extends BaseAIProvider
{
  readonly name = "openai";

  constructor(
    config: AIProviderConfig,
    private readonly retryOptions: RetryOptions = {
      retries: 3,
      baseDelayMs: 1000,
    },
  ) {
    super(config);
  }

  async review(
    input: AIReviewInput,
  ): Promise<AIReviewResult> {
    return withRetry(
      () => this.requestReview(input),
      {
        ...this.retryOptions,
        shouldRetry: (error) =>
          error instanceof OpenAIRequestError
            ? error.retryable
            : true,
      },
    );
  }

  private async requestReview(
    input: AIReviewInput,
  ): Promise<AIReviewResult> {
    let response: Response;

    try {
      response = await fetch(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${this.config.apiKey}`,
        },

        body: JSON.stringify({
          model: this.config.model,

          temperature: 0.1,

          response_format: {
            type: "json_object",
          },

          messages: [
            {
              role: "system",
              content:
                "You are a Staff Software Engineer performing code review.",
            },
            {
              role: "user",
              content:
                buildReviewPrompt(input),
            },
          ],
        }),
      },
      );
    } catch (error) {
      throw new OpenAIRequestError(
        error instanceof Error
          ? `OpenAI network request failed: ${error.message}`
          : "OpenAI network request failed",
        true,
      );
    }

    if (!response.ok) {
      throw new OpenAIRequestError(
        `OpenAI request failed: ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }

    const data =
      await this.readResponse(response);

    const content =
      data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "AI returned empty response",
      );
    }

    return parseAIResult(this.parseContent(content));
  }

  private async readResponse(
    response: Response,
  ): Promise<OpenAIResponse> {
    try {
      const value: unknown = await response.json();

      if (!isOpenAIResponse(value)) {
        throw new Error("response body was not an object");
      }

      return value;
    } catch {
      throw new OpenAIRequestError(
        "AI returned an invalid response body",
        false,
      );
    }
  }

  private parseContent(content: string): unknown {
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new OpenAIRequestError(
        "AI returned invalid JSON",
        false,
      );
    }
  }
}

function isOpenAIResponse(value: unknown): value is OpenAIResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const response = value as { choices?: unknown };

  if (response.choices === undefined) {
    return true;
  }

  return (
    Array.isArray(response.choices) &&
    response.choices.every(isOpenAIChoice)
  );
}

function isOpenAIChoice(
  value: unknown,
): value is NonNullable<OpenAIResponse["choices"]>[number] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const choice = value as { message?: unknown };

  return choice.message === undefined || isOpenAIMessage(choice.message);
}

function isOpenAIMessage(
  value: unknown,
): value is { content?: string } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const message = value as { content?: unknown };

  return message.content === undefined || typeof message.content === "string";
}
