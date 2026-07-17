import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type SecuritySeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export type SecurityConfidence =
  | "high"
  | "medium"
  | "low";

export type SecurityCategory =
  | "execution"
  | "injection"
  | "xss"
  | "secrets"
  | "crypto"
  | "authentication"
  | "authorization"
  | "session"
  | "data"
  | "network"
  | "filesystem"
  | "ssrf"
  | "configuration"
  | "logging"
  | "supply-chain"
  | "object"
  | "business"
  | "compliance"
  | "quality-gate";

export type SecurityStandard =
  | "cwe"
  | "owasp-top-10"
  | "owasp-asvs"
  | "pci-dss"
  | "nist-ssdf"
  | "banking-policy";

export interface SecurityStandardMapping {
  readonly standard: SecurityStandard;
  readonly id: string;
  readonly control?: string;
}

export type SecuritySourceKind =
  | "request-input"
  | "user-input"
  | "environment"
  | "file-content"
  | "network-response"
  | "storage"
  | "unknown";

export type SecuritySinkKind =
  | "code-execution"
  | "sql-query"
  | "html-render"
  | "shell-command"
  | "filesystem-path"
  | "network-request"
  | "secret-output"
  | "crypto-operation"
  | "unknown";

export type SecuritySanitizerKind =
  | "parameterized-query"
  | "html-escape"
  | "url-allowlist"
  | "path-normalization"
  | "schema-validation"
  | "crypto-random"
  | "unknown";

export interface SecurityRange {
  readonly start: number;
  readonly end: number;
}

export interface SecurityLocation {
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
  readonly range?: SecurityRange;
}

export interface SecurityEvidence {
  readonly message: string;
  readonly location?: SecurityLocation;
  readonly sourceKind?: SecuritySourceKind;
  readonly sinkKind?: SecuritySinkKind;
  readonly sanitizerKind?: SecuritySanitizerKind;
}

export interface SecurityFlowStep {
  readonly kind: "source" | "transform" | "sanitizer" | "sink";
  readonly label: string;
  readonly location?: SecurityLocation;
  readonly sourceKind?: SecuritySourceKind;
  readonly sinkKind?: SecuritySinkKind;
  readonly sanitizerKind?: SecuritySanitizerKind;
}

export interface SecurityRuleMeta {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: SecurityCategory;
  readonly defaultSeverity: SecuritySeverity;
  readonly defaultConfidence: SecurityConfidence;
  readonly standards?: readonly SecurityStandardMapping[];
}

export interface SecurityRuleContext {
  readonly source: string;
  readonly file: string;
  readonly ast: TSESTree.Program;
}

export interface SecurityFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: SecuritySeverity;
  readonly confidence: SecurityConfidence;
  readonly category: SecurityCategory;
  readonly location: SecurityLocation;
  readonly evidence: readonly SecurityEvidence[];
  readonly flow?: readonly SecurityFlowStep[];
  readonly standards?: readonly SecurityStandardMapping[];
  readonly sinkKind?: SecuritySinkKind;
  readonly suggestion?: string;
}

export interface SecurityRule {
  readonly meta: SecurityRuleMeta;

  check(context: SecurityRuleContext): readonly SecurityFinding[];
}

export interface SecurityPolicy {
  readonly id: string;
  readonly enabledRuleIds?: readonly string[];
  readonly disabledRuleIds?: readonly string[];
  readonly categories?: readonly SecurityCategory[];
}

export interface SecurityFindingIdInput {
  readonly ruleId: string;
  readonly path: string;
  readonly range?: SecurityRange;
  readonly sinkKind?: SecuritySinkKind;
}
