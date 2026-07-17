import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityConfidence = "high" | "medium" | "low";

export type SecurityCategory =
  | "execution"
  | "injection"
  | "xss"
  | "secrets"
  | "cryptography"
  | "authentication"
  | "authorization"
  | "session"
  | "sensitive-data"
  | "network"
  | "filesystem"
  | "ssrf"
  | "configuration"
  | "logging"
  | "supply-chain"
  | "object-security"
  | "business-logic";

export type SecuritySourceKind =
  | "request"
  | "environment"
  | "file"
  | "network"
  | "storage"
  | "process-argument"
  | "unknown";

export type SecuritySinkKind =
  | "command"
  | "sql-query"
  | "nosql-query"
  | "html"
  | "url"
  | "filesystem"
  | "network-request"
  | "dynamic-code"
  | "serialization"
  | "unknown";

export type SecuritySanitizerKind =
  | "parameterization"
  | "html-sanitization"
  | "url-validation"
  | "path-containment"
  | "allowlist"
  | "encoding"
  | "unknown";

export interface SecurityRange {
  readonly start: number;
  readonly end: number;
}

export interface SecurityLocation {
  readonly path: string;
  readonly range: SecurityRange;
  readonly line?: number;
  readonly column?: number;
}

export interface SecurityStandardMapping {
  readonly standard: "cwe" | "owasp-top-10" | "owasp-asvs" | "pci-dss" | "nist-ssdf" | "internal";
  readonly id: string;
  readonly description?: string;
}

export interface SecurityEvidence {
  readonly kind: "source" | "sink" | "sanitizer" | "configuration" | "code";
  readonly message: string;
  readonly location?: SecurityLocation;
  readonly sourceKind?: SecuritySourceKind;
  readonly sinkKind?: SecuritySinkKind;
  readonly sanitizerKind?: SecuritySanitizerKind;
}

export interface SecurityFlowStep {
  readonly kind: "source" | "transform" | "sanitizer" | "sink";
  readonly message: string;
  readonly location: SecurityLocation;
  readonly sourceKind?: SecuritySourceKind;
  readonly sinkKind?: SecuritySinkKind;
  readonly sanitizerKind?: SecuritySanitizerKind;
}

export interface SecurityFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly title: string;
  readonly message: string;
  readonly category: SecurityCategory;
  readonly severity: SecuritySeverity;
  readonly confidence: SecurityConfidence;
  readonly location: SecurityLocation;
  readonly evidence: readonly SecurityEvidence[];
  readonly flow?: readonly SecurityFlowStep[];
  readonly standards?: readonly SecurityStandardMapping[];
  readonly suggestion?: string;
}

export interface SecurityRuleMeta {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: SecurityCategory;
  readonly defaultSeverity: SecuritySeverity;
  readonly defaultConfidence: SecurityConfidence;
  readonly standards: readonly SecurityStandardMapping[];
}

export interface SecurityRuleContext {
  readonly source: string;
  readonly file: string;
  readonly ast: TSESTree.Program;
}

export interface SecurityRule {
  readonly meta: SecurityRuleMeta;
  check(context: SecurityRuleContext): readonly unknown[];
}

export interface SecurityPolicy {
  readonly id: string;
  readonly enabledRuleIds?: readonly string[];
  readonly disabledRuleIds?: readonly string[];
}

export interface SecurityFindingIdInput {
  readonly ruleId: string;
  readonly path: string;
  readonly range: SecurityRange;
  readonly sinkKind: SecuritySinkKind;
}

export function createSecurityFindingId(input: SecurityFindingIdInput): string {
  const fingerprint = [
    input.ruleId,
    input.path,
    String(input.range.start),
    String(input.range.end),
    input.sinkKind,
  ].map(encodeURIComponent).join(":");

  return `security:${fingerprint}`;
}
