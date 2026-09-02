import type { ReviewFinding, ReviewResult, Severity } from "../domain/review";

const SARIF_SCHEMA = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json";

export interface SarifDocument {
  readonly $schema: typeof SARIF_SCHEMA;
  readonly version: "2.1.0";
  readonly runs: readonly SarifRun[];
}

interface SarifRun {
  readonly tool: { readonly driver: { readonly name: string; readonly rules: readonly SarifRule[] } };
  readonly results: readonly SarifResult[];
}

interface SarifRule {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: { readonly text: string };
}

interface SarifResult {
  readonly ruleId: string;
  readonly level: "error" | "warning" | "note";
  readonly message: { readonly text: string };
  readonly locations?: readonly {
    readonly physicalLocation: {
      readonly artifactLocation: { readonly uri: string };
      readonly region?: { readonly startLine: number; readonly startColumn?: number };
    };
  }[];
  readonly properties: Readonly<Record<string, string | number>>;
}

export function createSarifDocument(
  result?: Pick<ReviewResult, "findings">,
): SarifDocument {
  const findings = result?.findings ?? [];
  const rules = [...new Map(findings.map((finding) => [
    finding.ruleId,
    {
      id: finding.ruleId,
      name: finding.ruleId,
      shortDescription: { text: finding.title },
    },
  ])).values()];

  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "AI Reviewer", rules } },
      results: findings.map(toSarifResult),
    }],
  };
}

function toSarifResult(finding: ReviewFinding): SarifResult {
  const uri = finding.location === undefined ? undefined : safeRepositoryUri(finding.location.file);
  const line = validLine(finding.location?.line);
  const column = validColumn(finding.location?.column);
  const location = uri === undefined
    ? {}
    : {
        locations: [{
          physicalLocation: {
            artifactLocation: { uri },
            ...(line === undefined
              ? {}
              : {
                  region: {
                    startLine: line,
                    ...(column === undefined
                      ? {}
                      : { startColumn: column }),
                  },
                }),
          },
        }],
      };

  return {
    ruleId: finding.ruleId,
    level: toSarifLevel(finding.severity),
    message: { text: finding.message },
    ...location,
    properties: {
      findingId: finding.id,
      severity: finding.severity,
      source: finding.source,
      confidence: finding.confidence,
      ...(finding.suggestion === undefined ? {} : { suggestion: finding.suggestion }),
    },
  };
}

function validLine(line: number | undefined): number | undefined {
  return line !== undefined && Number.isSafeInteger(line) && line > 0 ? line : undefined;
}

function validColumn(column: number | undefined): number | undefined {
  return column !== undefined
    && Number.isSafeInteger(column)
    && column >= 0
    && column < Number.MAX_SAFE_INTEGER
    ? column + 1
    : undefined;
}

function safeRepositoryUri(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    normalized.length === 0
    || normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || segments.some((segment) => segment === ".." || segment.length === 0)
  ) {
    return undefined;
  }
  return segments.map(encodeURIComponent).join("/");
}

function toSarifLevel(severity: Severity): SarifResult["level"] {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}
