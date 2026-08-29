import type {
  SecurityFinding,
  SecurityRuleContext,
} from "../model/types";
import { isSecurityFinding } from "../model/validation";
import type { SecurityRuleRegistry } from "../registry/security-rule-registry";
import type { ReviewWarning } from "../../../domain/review";

export interface SecurityAnalysisResult {
  readonly findings: readonly SecurityFinding[];
  readonly warnings: readonly ReviewWarning[];
}

export class SecurityAnalysisEngine {
  analyze(
    context: SecurityRuleContext,
    registry: SecurityRuleRegistry,
  ): readonly SecurityFinding[] {
    return this.analyzeWithWarnings(context, registry).findings;
  }

  analyzeWithWarnings(
    context: SecurityRuleContext,
    registry: SecurityRuleRegistry,
  ): SecurityAnalysisResult {
    const findings: SecurityFinding[] = [];
    const warnings: ReviewWarning[] = [];

    for (const rule of registry.getRules()) {
      try {
        const ruleFindings = rule.check(context);

        findings.push(
          ...ruleFindings.filter(isSecurityFinding),
        );
      } catch {
        warnings.push({
          code: "SECURITY_RULE_FAILED",
          message: `Security rule ${rule.meta.id} failed while analyzing ${context.file}.`,
        });
      }
    }

    return {
      findings: this.deduplicateFindings(findings),
      warnings,
    };
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
