export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FindingSource =
  | "ast"
  | "architecture"
  | "security"
  | "performance"
  | "ai";

export type ReviewDecision = "PASS" | "WARN" | "FAIL";

export interface ReviewLocation {
  file: string;
  line?: number;
  column?: number;
}

export interface ReviewFinding {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  severity: Severity;
  source: FindingSource;
  location?: ReviewLocation;
  suggestion?: string;
  confidence: number;
}

export interface ReviewStats {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export type ReviewWarningCode =
  | "AI_REVIEW_FAILED"
  | "AI_AGENT_FAILED"
  | "AI_INPUT_OMITTED"
  | "AI_INPUT_REDACTED"
  | "AI_INPUT_TRUNCATED"
  | "SOURCE_PARSE_FAILED"
  | "ANALYZER_CONTRIBUTION_FAILED"
  | "SECURITY_RULE_FAILED"
  | "REACT_RULE_FAILED";

/** A non-fatal condition encountered while producing a review. */
export interface ReviewWarning {
  code: ReviewWarningCode;
  message: string;
}

export interface ReviewResult {
  score: number;
  decision: ReviewDecision;
  findings: ReviewFinding[];
  stats: ReviewStats;
  /** Non-fatal provider failures; deterministic findings are still valid. */
  warnings: ReviewWarning[];
  /** Auditable security policy decision when a PR quality gate was requested. */
  securityQualityGate?: ReviewSecurityQualityGate;
  durationMs: number;
}

export interface ReviewSecurityQualityGate {
  readonly decision: "pass" | "warn" | "fail";
  readonly profileId: string;
  readonly evaluatedAt: string;
  readonly summary: {
    readonly total: number;
    readonly newFindings: number;
    readonly baseline: number;
    readonly suppressed: number;
    readonly blocking: number;
    readonly warnings: number;
  };
  readonly reasons: readonly {
    readonly code: string;
    readonly findingId: string;
    readonly ruleId: string;
    readonly message: string;
  }[];
}
