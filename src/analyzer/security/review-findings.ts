import type { ReviewFinding } from "../../review/types";

import { parseSource } from "../ast/parser";
import { SecurityAnalysisEngine } from "./engine/security-analysis-engine";
import type { SecurityConfidence, SecurityFinding } from "./model/types";
import { SecurityRuleRegistry } from "./registry/security-rule-registry";
import { secretsRules } from "./rules/secrets";
import { authenticationRules } from "./rules/auth";
import { authorizationRules } from "./rules/authorization";
import { sessionTokenRules } from "./rules/session";
import { networkTransportRules } from "./rules/network";
import { securityConfigurationRules } from "./rules/configuration";
import { objectSecurityRules } from "./rules/object";
import { sensitiveDataRules } from "./rules/data";
import { loggingErrorRules } from "./rules/logging";
import { ssrfRules } from "./rules/ssrf";
import { filesystemRules } from "./rules/filesystem";
import { analyzeSupplyChain, type SupplyChainManifest } from "./supply-chain";

export function analyzeSecurityFindings(file: string, source: string): readonly ReviewFinding[] {
  const registry = new SecurityRuleRegistry();
  for (const rule of secretsRules) registry.register(rule);
  for (const rule of authenticationRules) registry.register(rule);
  for (const rule of authorizationRules) registry.register(rule);
  for (const rule of sessionTokenRules) registry.register(rule);
  for (const rule of networkTransportRules) registry.register(rule);
  for (const rule of securityConfigurationRules) registry.register(rule);
  for (const rule of objectSecurityRules) registry.register(rule);
  for (const rule of sensitiveDataRules) registry.register(rule);
  for (const rule of loggingErrorRules) registry.register(rule);
  for (const rule of ssrfRules) registry.register(rule);
  for (const rule of filesystemRules) registry.register(rule);

  return new SecurityAnalysisEngine().analyze({ file, source, ast: parseSource(source) }, registry)
    .map(toReviewFinding);
}

export function analyzeSupplyChainFindings(
  files: readonly { readonly path: string; readonly content: string }[],
): readonly ReviewFinding[] {
  const manifests = files.flatMap(toSupplyChainManifest);
  const lockfiles = files.flatMap((file) => toSupplyChainLockfile(file.path));
  const sourceFiles = files.map((file) => ({ path: file.path, source: file.content }));

  return analyzeSupplyChain({ manifests, lockfiles, sourceFiles }).map(toReviewFinding);
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
