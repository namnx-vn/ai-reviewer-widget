import {
  BaseAIProvider,
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

export class OpenAIProvider
  extends BaseAIProvider
{
  readonly name = "openai";

  async review(
    input: AIReviewInput,
  ): Promise<AIReviewResult> {
    const response = await fetch(
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

    if (!response.ok) {
      throw new Error(
        `OpenAI request failed: ${response.status}`,
      );
    }

    const data =
      (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

    const content =
      data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "AI returned empty response",
      );
    }

    return parseAIResult(
      JSON.parse(content),
    );
  }
}