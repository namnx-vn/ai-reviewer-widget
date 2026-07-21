import type {
  SecurityCategory,
  SecurityPolicy,
  SecurityRule,
} from "../model/types";
import { validateSecurityRuleMeta } from "../model/validation";

export class SecurityRuleRegistry {
  private readonly rulesById = new Map<string, SecurityRule>();

  register(rule: SecurityRule): void {
    validateSecurityRuleMeta(rule.meta);

    if (this.rulesById.has(rule.meta.id)) {
      throw new Error(`Security rule "${rule.meta.id}" is already registered.`);
    }

    this.rulesById.set(rule.meta.id, rule);
  }

  getRules(): readonly SecurityRule[] {
    return [...this.rulesById.values()];
  }

  getByCategory(category: SecurityCategory): readonly SecurityRule[] {
    return this.getRules().filter((rule) => rule.meta.category === category);
  }

  getRulesForPolicy(policy: SecurityPolicy): readonly SecurityRule[] {
    const enabledRuleIds = new Set(policy.enabledRuleIds);
    const disabledRuleIds = new Set(policy.disabledRuleIds);
    const categories = new Set(policy.categories);

    return this.getRules().filter((rule) => {
      if (disabledRuleIds.has(rule.meta.id)) {
        return false;
      }

      if (enabledRuleIds.size > 0 && !enabledRuleIds.has(rule.meta.id)) {
        return false;
      }

      if (categories.size > 0 && !categories.has(rule.meta.category)) {
        return false;
      }

      return true;
    });
  }

  has(ruleId: string): boolean {
    return this.rulesById.has(ruleId);
  }
}
