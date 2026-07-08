import { OpenAIProvider } from "./openai-provider";

export type AIEnvironment = Readonly<Record<string, string | undefined>>;

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function createOpenAIProviderFromEnv(
  environment: AIEnvironment = process.env,
): OpenAIProvider | undefined {
  const apiKey = environment.AI_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }

  const baseUrl = (environment.AI_BASE_URL?.trim() || DEFAULT_BASE_URL)
    .replace(/\/+$/, "");

  return new OpenAIProvider({
    apiKey,
    model: environment.AI_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl,
  });
}
