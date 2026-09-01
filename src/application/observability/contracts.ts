export const OPERATIONAL_DIAGNOSTIC_CATEGORIES = [
  "configuration",
  "source",
  "analyzer",
  "ai-provider",
  "publication",
  "persistence",
  "quality-gate",
  "platform",
] as const;

export type OperationalDiagnosticCategory = typeof OPERATIONAL_DIAGNOSTIC_CATEGORIES[number];

export type OperationalStage =
  | "platform.total"
  | "source.collection"
  | "configuration.resolution"
  | "review.execution"
  | "deterministic.analysis"
  | "ai.review"
  | "quality-gate.evaluation"
  | "persistence.save"
  | "publication.publish";

export interface AIUsageMetadata {
  readonly model?: string;
  readonly requestCount?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly retryCount?: number;
  readonly partialFailureCount?: number;
}

export interface OperationalTelemetryEvent {
  readonly type: "stage" | "diagnostic";
  readonly stage?: OperationalStage;
  readonly category?: OperationalDiagnosticCategory;
  readonly outcome: "started" | "completed" | "failed" | "warning";
  readonly durationMs?: number;
  readonly correlationId?: string;
  readonly code?: string;
  readonly usage?: AIUsageMetadata;
}
