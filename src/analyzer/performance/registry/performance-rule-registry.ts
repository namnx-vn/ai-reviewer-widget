import type { PerformanceRule } from "../model/types";
import { validatePerformanceRuleMeta } from "../model/validation";
export class PerformanceRuleRegistry {
  private readonly rulesById = new Map<string, PerformanceRule>();
  register(rule: PerformanceRule): void { validatePerformanceRuleMeta(rule.meta); if (this.rulesById.has(rule.meta.id)) throw new Error(`Performance rule "${rule.meta.id}" is already registered.`); this.rulesById.set(rule.meta.id, rule); }
  getRules(): readonly PerformanceRule[] { return [...this.rulesById.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id)); }
  getEnabled(disabledRuleIds: readonly string[] = []): readonly PerformanceRule[] { const disabled = new Set(disabledRuleIds); return this.getRules().filter((rule) => !disabled.has(rule.meta.id)); }
}
