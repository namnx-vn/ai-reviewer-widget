import type { PerformanceFinding, PerformanceRuleContext } from "../model/types";
import { isPerformanceFinding } from "../model/validation";
import { shouldRunPerformanceRuleForFile } from "../policies/test-file-policy";
import type { PerformanceRuleRegistry } from "../registry/performance-rule-registry";

export class PerformanceAnalysisEngine {
  analyze(
    context: PerformanceRuleContext,
    registry: PerformanceRuleRegistry,
  ): readonly PerformanceFinding[] {
    const unique = new Map<string, PerformanceFinding>();

    for (const rule of registry.getEnabled()) {
      if (!shouldRunPerformanceRuleForFile(rule.meta.id, context.file)) continue;
      for (const finding of rule.check(context)) {
        if (isPerformanceFinding(finding)) unique.set(finding.id, finding);
      }
    }

    return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}
