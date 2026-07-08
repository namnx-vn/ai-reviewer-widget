import { describe, expect, it } from "vitest";

import { createOpenAIProviderFromEnv } from "../factory";

describe("createOpenAIProviderFromEnv", () => {
  it("does not create a provider without an API key", () => {
    expect(createOpenAIProviderFromEnv({})).toBeUndefined();
  });

  it("uses explicit environment configuration", () => {
    const provider = createOpenAIProviderFromEnv({
      AI_API_KEY: "key",
      AI_MODEL: "model",
      AI_BASE_URL: "https://example.test/v1/",
    });

    expect(provider?.name).toBe("openai");
  });
});
