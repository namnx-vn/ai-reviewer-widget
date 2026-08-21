import { describe, expect, it } from "vitest";

import {
  createAIProviderFromEnv,
  createOpenAIProviderFromEnv,
} from "../factory";

describe("createOpenAIProviderFromEnv", () => {
  it("does not create a provider without an API key", () => {
    expect(createOpenAIProviderFromEnv({})).toBeUndefined();
  });

  it("uses explicit environment configuration", () => {
    const provider = createOpenAIProviderFromEnv({
      AI_API_KEY: "key",
      AI_MODEL: "model",
      AI_BASE_URL: "https://example.test/v1/",
      AI_ALLOWED_BASE_URLS: "https://example.test/v1",
    });

    expect(provider?.name).toBe("openai");
  });

  it("rejects unallowlisted and non-HTTPS AI endpoints", () => {
    expect(() => createOpenAIProviderFromEnv({
      AI_API_KEY: "key",
      AI_BASE_URL: "https://example.test/v1",
    })).toThrow(/allowlist/i);

    expect(() => createOpenAIProviderFromEnv({
      AI_API_KEY: "key",
      AI_BASE_URL: "http://api.openai.com/v1",
      AI_ALLOWED_BASE_URLS: "http://api.openai.com/v1",
    })).toThrow(/HTTPS/i);
  });

  it("rejects an unsafe request timeout", () => {
    expect(() => createOpenAIProviderFromEnv({
      AI_API_KEY: "key",
      AI_TIMEOUT_MS: "500",
    })).toThrow(/AI_TIMEOUT_MS/);
  });
});

describe("createAIProviderFromEnv", () => {
  it("keeps single-agent review as the default", () => {
    const provider = createAIProviderFromEnv({ AI_API_KEY: "key" });

    expect(provider?.name).toBe("openai");
  });

  it("creates the multi-agent orchestrator when explicitly enabled", () => {
    const provider = createAIProviderFromEnv({
      AI_API_KEY: "key",
      AI_REVIEW_MODE: "multi-agent",
    });

    expect(provider?.name).toBe("openai:multi-agent");
  });

  it("rejects unsupported review modes", () => {
    expect(() => createAIProviderFromEnv({
      AI_API_KEY: "key",
      AI_REVIEW_MODE: "swarm",
    })).toThrow(/AI_REVIEW_MODE/);
  });
});
