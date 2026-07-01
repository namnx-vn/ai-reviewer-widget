import type {
  AIReviewResult,
} from "./types";

const severities = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export function parseAIResult(
  value: unknown,
): AIReviewResult {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return {
      findings: [],
    };
  }

  const input =
    value as Record<string, unknown>;

  if (!Array.isArray(input.findings)) {
    return {
      findings: [],
    };
  }

  return {
    findings: input.findings
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(
            item &&
              typeof item === "object",
          ),
      )
      .map((item) => ({
        title:
          typeof item.title === "string"
            ? item.title
            : "AI finding",

        message:
          typeof item.message === "string"
            ? item.message
            : "",

        severity:
          typeof item.severity === "string" &&
          severities.has(item.severity)
            ? item.severity as
                AIReviewResult["findings"][number]["severity"]
            : "info",

        suggestion:
          typeof item.suggestion === "string"
            ? item.suggestion
            : undefined,

        confidence:
          typeof item.confidence === "number"
            ? Math.min(
                1,
                Math.max(0, item.confidence),
              )
            : undefined,
      })),
  };
}