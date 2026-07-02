import type {
  AIReviewResult,
} from "./types";

import type {
  Severity,
} from "../review/types";

const severities =
  new Set<Severity>([
    "critical",
    "high",
    "medium",
    "low",
    "info",
  ]);

function isSeverity(
  value: unknown,
): value is Severity {
  return (
    typeof value === "string" &&
    severities.has(
      value as Severity,
    )
  );
}

export function parseAIResult(
  input: unknown,
): AIReviewResult {
  if (
    !input ||
    typeof input !== "object"
  ) {
    return {
      findings: [],
    };
  }

  const value =
    input as Record<string, unknown>;

  if (!Array.isArray(value.findings)) {
    return {
      findings: [],
    };
  }

  return {
    findings: value.findings.flatMap(
      (item) => {
        if (
          !item ||
          typeof item !== "object"
        ) {
          return [];
        }

        const finding =
          item as Record<
            string,
            unknown
          >;

        if (
          typeof finding.title !==
            "string" ||
          typeof finding.message !==
            "string" ||
          !isSeverity(
            finding.severity,
          )
        ) {
          return [];
        }

        const confidence =
          typeof finding.confidence ===
          "number"
            ? Math.min(
                1,
                Math.max(
                  0,
                  finding.confidence,
                ),
              )
            : 0;

        if (confidence < 0.65) {
          return [];
        }

        return [
          {
            title: finding.title,

            message:
              finding.message,

            severity:
              finding.severity,

            suggestion:
              typeof finding.suggestion ===
              "string"
                ? finding.suggestion
                : undefined,

            confidence,

            file:
              typeof finding.file ===
              "string"
                ? finding.file
                : undefined,

            line:
              typeof finding.line ===
              "number"
                ? finding.line
                : undefined,
          },
        ];
      },
    ),
  };
}