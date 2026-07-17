import type {
  SecurityFinding,
  SecurityRuleContext,
} from "../model/types";
import { isSecurityFinding } from "../model/validation";
import type { SecurityRuleRegistry } from "../registry/security-rule-registry";

export class SecurityAnalysisEngine {
  analyze(
    context: SecurityRuleContext,
    registry: SecurityRuleRegistry,
  ): readonly SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    for (const rule of registry.getRules()) {
      try {
        const ruleFindings = rule.check(context);

        findings.push(
          ...ruleFindings.filter(isSecurityFinding),
        );
      } catch {
        continue;
      }
    }

    return this.deduplicateFindings(findings);
  }

  private deduplicateFindings(
    findings: readonly SecurityFinding[],
  ): readonly SecurityFinding[] {
    const findingIds = new Set<string>();

    return findings.filter((finding) => {
      if (findingIds.has(finding.id)) {
        return false;
      }

      findingIds.add(finding.id);
      return true;
    });
  }
}
