import type { SecurityCategory, SecurityPolicy, SecurityRule, SecurityRuleMeta } from "./model";

const RULE_ID_PATTERN = /^security\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export class SecurityRuleRegistry {
  private readonly rules = new Map<string, SecurityRule>();

  register(rule: SecurityRule): void {
    this.assertValidMetadata(rule.meta);

    if (this.rules.has(rule.meta.id)) {
      throw new Error(`Security rule "${rule.meta.id}" is already registered.`);
    }

    this.rules.set(rule.meta.id, rule);
  }

  getRules(): readonly SecurityRule[] {
    return [...this.rules.values()];
  }

  getByCategory(category: SecurityCategory): readonly SecurityRule[] {
    return this.getRules().filter((rule) => rule.meta.category === category);
  }

  getRulesForPolicy(policy: SecurityPolicy): readonly SecurityRule[] {
    const enabledRuleIds = policy.enabledRuleIds === undefined
      ? undefined
      : new Set(policy.enabledRuleIds);
    const disabledRuleIds = new Set(policy.disabledRuleIds ?? []);

    return this.getRules().filter((rule) => (
      (enabledRuleIds === undefined || enabledRuleIds.has(rule.meta.id)) &&
      !disabledRuleIds.has(rule.meta.id)
    ));
  }

  private assertValidMetadata(meta: SecurityRuleMeta): void {
    if (!RULE_ID_PATTERN.test(meta.id)) {
      throw new Error(`Security rule id "${meta.id}" must use the security.<category>.<name> format.`);
    }

    if (meta.title.trim().length === 0 || meta.description.trim().length === 0) {
      throw new Error(`Security rule "${meta.id}" must have a title and description.`);
    }

    if (!isSecuritySeverity(meta.defaultSeverity)) {
      throw new Error(`Security rule "${meta.id}" has an invalid default severity.`);
    }

    if (!isSecurityConfidence(meta.defaultConfidence)) {
      throw new Error(`Security rule "${meta.id}" has an invalid default confidence.`);
    }
  }
}

export function isSecuritySeverity(value: unknown): value is SecurityRuleMeta["defaultSeverity"] {
  return value === "critical" || value === "high" || value === "medium" || value === "low" || value === "info";
}

export function isSecurityConfidence(value: unknown): value is SecurityRuleMeta["defaultConfidence"] {
  return value === "high" || value === "medium" || value === "low";
}
