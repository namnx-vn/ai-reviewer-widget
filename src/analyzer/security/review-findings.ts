import type { ReviewFinding } from "../../review/types";

import { parseSource } from "../ast/parser";
import { SecurityAnalysisEngine } from "./engine/security-analysis-engine";
import type { SecurityConfidence, SecurityFinding } from "./model/types";
import { SecurityRuleRegistry } from "./registry/security-rule-registry";
import { secretsRules } from "./rules/secrets";

export function analyzeSecretFindings(file: string, source: string): readonly ReviewFinding[] {
  const registry = new SecurityRuleRegistry();
  for (const rule of secretsRules) registry.register(rule);

  return new SecurityAnalysisEngine().analyze({ file, source, ast: parseSource(source) }, registry)
    .map(toReviewFinding);
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
