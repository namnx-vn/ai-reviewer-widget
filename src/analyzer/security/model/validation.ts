import type {
  SecurityCategory,
  SecurityConfidence,
  SecurityFinding,
  SecurityLocation,
  SecurityRuleMeta,
  SecuritySeverity,
} from "./types";

const RULE_ID_PATTERN = /^security\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const SECURITY_SEVERITIES: readonly SecuritySeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

const SECURITY_CONFIDENCES: readonly SecurityConfidence[] = [
  "high",
  "medium",
  "low",
];

const SECURITY_CATEGORIES: readonly SecurityCategory[] = [
  "execution",
  "injection",
  "xss",
  "secrets",
  "crypto",
  "authentication",
  "authorization",
  "session",
  "data",
  "network",
  "filesystem",
  "ssrf",
  "configuration",
  "logging",
  "supply-chain",
  "object",
  "business",
  "compliance",
  "quality-gate",
];

export function validateSecurityRuleMeta(meta: SecurityRuleMeta): void {
  if (!RULE_ID_PATTERN.test(meta.id)) {
    throw new Error(`Security rule id "${meta.id}" is invalid.`);
  }

  if (!meta.title.trim()) {
    throw new Error(`Security rule "${meta.id}" must define a title.`);
  }

  if (!meta.description.trim()) {
    throw new Error(`Security rule "${meta.id}" must define a description.`);
  }

  if (!isSecurityCategory(meta.category)) {
    throw new Error(`Security rule "${meta.id}" has an invalid category.`);
  }

  if (!isSecuritySeverity(meta.defaultSeverity)) {
    throw new Error(`Security rule "${meta.id}" has an invalid severity.`);
  }

  if (!isSecurityConfidence(meta.defaultConfidence)) {
    throw new Error(`Security rule "${meta.id}" has an invalid confidence.`);
  }
}

export function isSecurityFinding(value: unknown): value is SecurityFinding {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.ruleId) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.message) &&
    isSecuritySeverity(value.severity) &&
    isSecurityConfidence(value.confidence) &&
    isSecurityCategory(value.category) &&
    isSecurityLocation(value.location) &&
    Array.isArray(value.evidence)
  );
}

function isSecurityLocation(value: unknown): value is SecurityLocation {
  if (!isRecord(value) || !isNonEmptyString(value.path)) {
    return false;
  }

  return (
    isOptionalNumber(value.line) &&
    isOptionalNumber(value.column) &&
    isOptionalRange(value.range)
  );
}

function isOptionalRange(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.start === "number" &&
    Number.isFinite(value.start) &&
    typeof value.end === "number" &&
    Number.isFinite(value.end) &&
    value.start <= value.end
  );
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSecuritySeverity(value: unknown): value is SecuritySeverity {
  return SECURITY_SEVERITIES.includes(value as SecuritySeverity);
}

function isSecurityConfidence(value: unknown): value is SecurityConfidence {
  return SECURITY_CONFIDENCES.includes(value as SecurityConfidence);
}

function isSecurityCategory(value: unknown): value is SecurityCategory {
  return SECURITY_CATEGORIES.includes(value as SecurityCategory);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
