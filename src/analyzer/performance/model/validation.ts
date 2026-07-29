import type { PerformanceFinding, PerformanceRuleMeta } from "./types";

const categories = new Set(["bundle", "rendering", "loading", "assets", "network", "async", "memory", "resource", "cpu", "database", "cache", "resilience", "backpressure", "rate-control", "transaction", "observability", "bank-ui"]);
const severities = new Set(["critical", "high", "medium", "low", "info"]);
const confidences = new Set(["high", "medium", "low"]);

export function validatePerformanceRuleMeta(meta: PerformanceRuleMeta): void {
  if (!/^performance\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(meta.id)) throw new Error(`Performance rule id "${meta.id}" is invalid.`);
  if (!meta.title.trim() || !meta.description.trim()) throw new Error(`Performance rule "${meta.id}" must define a title and description.`);
  if (!categories.has(meta.category) || !severities.has(meta.defaultSeverity) || !confidences.has(meta.defaultConfidence)) throw new Error(`Performance rule "${meta.id}" has invalid metadata.`);
}

export function isPerformanceFinding(value: unknown): value is PerformanceFinding {
  if (!value || typeof value !== "object") return false;
  const finding = value as Partial<PerformanceFinding>;
  return typeof finding.id === "string" && typeof finding.ruleId === "string" && typeof finding.title === "string" && typeof finding.message === "string" && severities.has(finding.severity ?? "") && confidences.has(finding.confidence ?? "") && categories.has(finding.category ?? "") && Boolean(finding.location?.path) && Array.isArray(finding.evidence);
}
