import type { AIProvider, AIReviewInput, AIReviewResult } from "./types";

import { buildReviewPrompt } from "./prompts";

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      model: string;
    },
  ) {}

  async review(input: AIReviewInput): Promise<AIReviewResult> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        Authorization: `Bearer ${this.config.apiKey}`,
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

            content: "You are an expert software engineering reviewer.",
          },

          {
            role: "user",

            content: buildReviewPrompt(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("AI returned empty response");
    }

    return JSON.parse(content) as AIReviewResult;
  }
}
