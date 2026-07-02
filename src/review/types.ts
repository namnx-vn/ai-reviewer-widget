export type Severity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export type FindingSource =
  | "ast"
  | "architecture"
  | "ai";

export type ReviewDecision =
  | "PASS"
  | "WARN"
  | "FAIL";

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

export interface ReviewResult {
  score: number;

  decision: ReviewDecision;

  findings: ReviewFinding[];

  stats: ReviewStats;

  durationMs: number;
}