import type {
  AIReviewAgentId,
  AIReviewResult,
  AIReviewWarning,
} from "./types";
import type { Severity } from "../domain/review";

const MINIMUM_CONFIDENCE = 0.65;
const MAXIMUM_TITLE_LENGTH = 300;
const MAXIMUM_MESSAGE_LENGTH = 4_000;
const MAXIMUM_SUGGESTION_LENGTH = 2_000;
const MAXIMUM_FILE_LENGTH = 1_000;
const MAXIMUM_WARNING_LENGTH = 1_000;
const MAXIMUM_FINDINGS = 100;
const MAXIMUM_WARNINGS = 20;
const severities: readonly string[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];
const agents: readonly string[] = [
  "security",
  "react",
  "architecture",
];

export function parseAIResult(input: unknown): AIReviewResult {
  if (!isRecord(input) || !Array.isArray(input.findings)) {
    return { findings: [] };
  }

  const findings = input.findings.slice(0, MAXIMUM_FINDINGS).flatMap(parseFinding);
  const warnings = Array.isArray(input.warnings)
    ? input.warnings.slice(0, MAXIMUM_WARNINGS).flatMap(parseWarning)
    : [];
  return warnings.length === 0 ? { findings } : { findings, warnings };
}

function parseFinding(item: unknown): AIReviewResult["findings"] {
  if (!isRecord(item)) return [];
  const title = validatedString(item.title, MAXIMUM_TITLE_LENGTH);
  const message = validatedString(item.message, MAXIMUM_MESSAGE_LENGTH);
  if (title === undefined || message === undefined || !isSeverity(item.severity)) return [];

  const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
    ? Math.min(1, Math.max(0, item.confidence))
    : 0;
  if (confidence < MINIMUM_CONFIDENCE) return [];

  return [{
    title,
    message,
    severity: item.severity,
    suggestion: validatedOptionalString(item.suggestion, MAXIMUM_SUGGESTION_LENGTH),
    confidence,
    file: validatedOptionalString(item.file, MAXIMUM_FILE_LENGTH),
    line: isPositiveSafeInteger(item.line) ? item.line : undefined,
    agent: isAgent(item.agent) ? item.agent : undefined,
  }];
}

function parseWarning(item: unknown): AIReviewWarning[] {
  if (!isRecord(item) || item.code !== "AI_AGENT_FAILED" || !isAgent(item.agent)) return [];
  const message = validatedString(item.message, MAXIMUM_WARNING_LENGTH);
  return message === undefined
    ? []
    : [{ code: "AI_AGENT_FAILED", agent: item.agent, message }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && severities.includes(value);
}

function isAgent(value: unknown): value is AIReviewAgentId {
  return typeof value === "string" && agents.includes(value);
}

function validatedString(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximumLength || hasDisallowedControlCharacter(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function hasDisallowedControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
}

function validatedOptionalString(value: unknown, maximumLength: number): string | undefined {
  return value === undefined ? undefined : validatedString(value, maximumLength);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
