import type { SecurityFinding, SecurityRuleContext } from "./model";
import { isSecurityConfidence, isSecuritySeverity, SecurityRuleRegistry } from "./registry";

export class SecurityAnalysisEngine {
  analyze(context: SecurityRuleContext, registry: SecurityRuleRegistry): readonly SecurityFinding[] {
    const findingIds = new Set<string>();
    const findings: SecurityFinding[] = [];

    for (const rule of registry.getRules()) {
      const candidates = this.runRule(rule.check, context);

      for (const candidate of candidates) {
        if (!isSecurityFinding(candidate) || findingIds.has(candidate.id)) {
          continue;
        }

        findingIds.add(candidate.id);
        findings.push(candidate);
      }
    }

    return findings;
  }

  private runRule(
    check: (context: SecurityRuleContext) => readonly unknown[],
    context: SecurityRuleContext,
  ): readonly unknown[] {
    try {
      return check(context);
    } catch {
      return [];
    }
  }
}

function isSecurityFinding(value: unknown): value is SecurityFinding {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.ruleId === "string" &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.category === "string" &&
    isSecuritySeverity(value.severity) &&
    isSecurityConfidence(value.confidence) &&
    isLocation(value.location) &&
    Array.isArray(value.evidence)
  );
}

function isLocation(value: unknown): boolean {
  if (!isRecord(value) || typeof value.path !== "string" || !isRecord(value.range)) {
    return false;
  }

  return typeof value.range.start === "number" && typeof value.range.end === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
