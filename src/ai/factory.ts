import { MultiAgentAIProvider } from "./multi-agent-provider";
import { OpenAIProvider } from "./openai-provider";
import type { AIProvider } from "./types";

export type AIEnvironment = Readonly<Record<string, string | undefined>>;

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 15_000;

export function createAIProviderFromEnv(
  environment: AIEnvironment = process.env,
): AIProvider | undefined {
  const provider = createOpenAIProviderFromEnv(environment);
  if (!provider) return undefined;

  const reviewMode = parseReviewMode(environment.AI_REVIEW_MODE);
  return reviewMode === "multi-agent"
    ? new MultiAgentAIProvider(provider)
    : provider;
}

export function createOpenAIProviderFromEnv(
  environment: AIEnvironment = process.env,
): OpenAIProvider | undefined {
  const apiKey = environment.AI_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }

  const baseUrl = normalizeBaseUrl(
    environment.AI_BASE_URL?.trim() || DEFAULT_BASE_URL,
    "AI_BASE_URL",
  );
  const allowedBaseUrls = new Set([
    normalizeBaseUrl(DEFAULT_BASE_URL, "default AI base URL"),
    ...parseAllowedBaseUrls(environment.AI_ALLOWED_BASE_URLS),
  ]);
  if (!allowedBaseUrls.has(baseUrl)) {
    throw new Error("AI_BASE_URL must match AI_ALLOWED_BASE_URLS allowlist.");
  }

  return new OpenAIProvider({
    apiKey,
    model: environment.AI_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl,
    timeoutMs: parseTimeout(environment.AI_TIMEOUT_MS),
  });
}

function parseReviewMode(value: string | undefined): "single" | "multi-agent" {
  if (value === undefined || value.trim().length === 0) return "single";

  const reviewMode = value.trim();
  if (reviewMode === "single" || reviewMode === "multi-agent") {
    return reviewMode;
  }

  throw new Error("AI_REVIEW_MODE must be either single or multi-agent.");
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) return DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error("AI_TIMEOUT_MS must be an integer between 1000 and 120000.");
  }
  return timeoutMs;
}

function parseAllowedBaseUrls(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeBaseUrl(item, "AI_ALLOWED_BASE_URLS"));
}

function normalizeBaseUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must not include credentials, query parameters, or fragments.`);
  }
  return parsed.toString().replace(/\/+$/, "");
}
