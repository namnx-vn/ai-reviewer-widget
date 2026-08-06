import type { ReviewFinding } from "../../review/types";
import type { ReviewWarning } from "../../review/types";

import { parseSource } from "../ast/parser";
import {
  attachComplianceMappings,
  createComplianceReport,
  createDefaultComplianceRegistry,
  type ComplianceReport,
} from "./compliance";
import { SecurityAnalysisEngine } from "./engine/security-analysis-engine";
import type { SecurityConfidence, SecurityFinding } from "./model/types";
import {
  applySecurityProfile,
  type SecurityProfileId,
} from "./policies";
import { SecurityRuleRegistry } from "./registry/security-rule-registry";
import { dangerousExecutionRules } from "./rules/dangerous-execution";
import { injectionRules } from "./rules/injection";
import { browserSecurityRules } from "./rules/browser";
import { cryptoRules } from "./rules/crypto";
import { secretsRules } from "./rules/secrets";
import { authenticationRules } from "./rules/auth";
import { authorizationRules } from "./rules/authorization";
import { sessionTokenRules } from "./rules/session";
import { networkTransportRules } from "./rules/network";
import { securityConfigurationRules } from "./rules/configuration";
import { objectSecurityRules } from "./rules/object";
import { sensitiveDataRules } from "./rules/data";
import { loggingErrorRules } from "./rules/logging";
import { businessSecurityRules } from "./rules/business";
import { ssrfRules } from "./rules/ssrf";
import { filesystemRules } from "./rules/filesystem";
import { analyzeSupplyChain, type SupplyChainManifest } from "./supply-chain";

export function analyzeSecurityEvidenceFindings(
  file: string,
  source: string,
  profileId: SecurityProfileId = "security/default",
): readonly SecurityFinding[] {
  const registry = createSourceSecurityRuleRegistry();
  const findings = new SecurityAnalysisEngine().analyze(
    { file, source, ast: parseSource(source) },
    registry,
  );
  const complianceRegistry = createDefaultComplianceRegistry();
  const mapped = findings.map((finding) => attachComplianceMappings(finding, complianceRegistry));
  return applySecurityProfile(mapped, profileId);
}

export function analyzeSecurityFindings(
  file: string,
  source: string,
  profileId: SecurityProfileId = "security/default",
): readonly ReviewFinding[] {
  return analyzeSecurityEvidenceFindings(file, source, profileId).map(toReviewFinding);
}

export interface SecurityReviewAnalysisResult {
  readonly findings: readonly ReviewFinding[];
  readonly warnings: readonly ReviewWarning[];
}

export function analyzeSecurityFindingsWithWarnings(
  file: string,
  source: string,
  profileId: SecurityProfileId = "security/default",
): SecurityReviewAnalysisResult {
  const registry = createSourceSecurityRuleRegistry();
  const analysis = new SecurityAnalysisEngine().analyzeWithWarnings(
    { file, source, ast: parseSource(source) },
    registry,
  );
  const complianceRegistry = createDefaultComplianceRegistry();
  const mapped = analysis.findings.map((finding) =>
    attachComplianceMappings(finding, complianceRegistry));

  return {
    findings: applySecurityProfile(mapped, profileId).map(toReviewFinding),
    warnings: analysis.warnings,
  };
}

export function analyzeSecurityCompliance(
  file: string,
  source: string,
  profileId: SecurityProfileId = "security/default",
): ComplianceReport {
  return createComplianceReport(analyzeSecurityEvidenceFindings(file, source, profileId));
}

export function analyzeSupplyChainFindings(
  files: readonly { readonly path: string; readonly content: string }[],
): readonly ReviewFinding[] {
  const manifests = files.flatMap(toSupplyChainManifest);
  const lockfiles = files.flatMap((file) => toSupplyChainLockfile(file.path));
  const sourceFiles = files.map((file) => ({ path: file.path, source: file.content }));

  return analyzeSupplyChain({ manifests, lockfiles, sourceFiles }).map(toReviewFinding);
}

export function createSourceSecurityRuleRegistry(): SecurityRuleRegistry {
  const registry = new SecurityRuleRegistry();
  for (const rule of dangerousExecutionRules) registry.register(rule);
  for (const rule of injectionRules) registry.register(rule);
  for (const rule of browserSecurityRules) registry.register(rule);
  for (const rule of secretsRules) registry.register(rule);
  for (const rule of cryptoRules) registry.register(rule);
  for (const rule of authenticationRules) registry.register(rule);
  for (const rule of authorizationRules) registry.register(rule);
  for (const rule of sessionTokenRules) registry.register(rule);
  for (const rule of sensitiveDataRules) registry.register(rule);
  for (const rule of networkTransportRules) registry.register(rule);
  for (const rule of filesystemRules) registry.register(rule);
  for (const rule of ssrfRules) registry.register(rule);
  for (const rule of securityConfigurationRules) registry.register(rule);
  for (const rule of loggingErrorRules) registry.register(rule);
  for (const rule of objectSecurityRules) registry.register(rule);
  for (const rule of businessSecurityRules) registry.register(rule);
  return registry;
}

function toReviewFinding(finding: SecurityFinding): ReviewFinding {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    title: finding.title,
    message: finding.message,
    severity: finding.severity,
    source: "security",
    location: { file: finding.location.path, line: finding.location.line, column: finding.location.column },
    suggestion: finding.suggestion,
    confidence: confidenceScore(finding.confidence),
  };
}

function confidenceScore(confidence: SecurityConfidence): number {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.75;
  return 0.5;
}

function toSupplyChainManifest(file: { readonly path: string; readonly content: string }): readonly SupplyChainManifest[] {
  if (!/(?:^|\/)package\.json$/.test(file.path)) return [];

  const parsed = parseManifest(file.content);
  return parsed === undefined ? [] : [{ path: file.path, ...parsed }];
}

function parseManifest(source: string): Omit<SupplyChainManifest, "path"> | undefined {
  try {
    const value: unknown = JSON.parse(source);
    if (!isRecord(value)) return undefined;
    return {
      dependencies: stringRecord(value.dependencies),
      devDependencies: stringRecord(value.devDependencies),
      optionalDependencies: stringRecord(value.optionalDependencies),
      peerDependencies: stringRecord(value.peerDependencies),
      scripts: stringRecord(value.scripts),
    };
  } catch {
    return undefined;
  }
}

function toSupplyChainLockfile(path: string): readonly { readonly path: string; readonly format: "npm" | "yarn" | "pnpm" | "bun" }[] {
  if (/(?:^|\/)package-lock\.json$/.test(path)) return [{ path, format: "npm" }];
  if (/(?:^|\/)yarn\.lock$/.test(path)) return [{ path, format: "yarn" }];
  if (/(?:^|\/)pnpm-lock\.yaml$/.test(path)) return [{ path, format: "pnpm" }];
  if (/(?:^|\/)bun\.lockb?$/.test(path)) return [{ path, format: "bun" }];
  return [];
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  const result: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (typeof item !== "string") return undefined;
    result[key] = item;
  }
  return result;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
