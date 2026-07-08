import { describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "../openai-provider";

describe("OpenAIProvider", () => {
  it("throws a controlled error for malformed JSON content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://example.test/v1",
    });

    await expect(provider.review({
      pullRequestTitle: "Test",
      diff: "",
      deterministicFindings: "[]",
    })).rejects.toThrow("AI returned invalid JSON");

    vi.unstubAllGlobals();
  });

  it("retries transient server responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://example.test/v1",
    }, { retries: 1, baseDelayMs: 0 });

    await expect(provider.review({
      pullRequestTitle: "Test",
      diff: "",
      deterministicFindings: "[]",
    })).resolves.toEqual({ findings: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
