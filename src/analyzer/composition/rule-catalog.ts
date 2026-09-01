import { nextjsPlugin, performancePlugin, reactPlugin } from "../../react";
import { noRemoteToRemoteImport } from "../architecture/rules";
import { noConsoleRule } from "../ast/rules/no-console";
import { noEvalRule } from "../ast/rules/no-eval";
import type { ASTRule } from "../ast/rules";
import { createPerformanceRuleRegistry } from "../performance/review-findings";
import { createSourceSecurityRuleRegistry } from "../security/review-findings";

const MICRO_FRONTEND_RULE_IDS = [
  "mfe.remote-imports-host",
  "mfe.remote-deep-import",
  "mfe.shared-state-cross-boundary",
] as const;

export function createDefaultRuleCatalog(
  additionalASTRules: readonly ASTRule[] = [],
  additionalRuleIds: readonly string[] = [],
): { readonly ruleIds: readonly string[] } {
  const ids = [
    noConsoleRule.id,
    noEvalRule.id,
    noRemoteToRemoteImport.id,
    ...MICRO_FRONTEND_RULE_IDS,
    ...createSourceSecurityRuleRegistry().getRules().map((rule) => rule.meta.id),
    ...createPerformanceRuleRegistry().getRules().map((rule) => rule.meta.id),
    ...reactPlugin.rules.map((rule) => rule.id),
    ...nextjsPlugin.rules.map((rule) => rule.id),
    ...performancePlugin.rules.map((rule) => rule.id),
    ...additionalASTRules.map((rule) => rule.id),
    ...additionalRuleIds,
  ];
  return { ruleIds: [...new Set(ids)].sort((left, right) => left.localeCompare(right)) };
}
