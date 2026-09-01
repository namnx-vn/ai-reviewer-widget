import type { ResolvedReviewConfiguration, RuleCatalog } from "./contracts";

export const DEFAULT_RULE_CATALOG: RuleCatalog = Object.freeze({
  ruleIds: Object.freeze([
    "quality.no-console",
    "security.no-eval",
    "mfe.no-remote-to-remote",
    "mfe.remote-imports-host",
    "mfe.remote-deep-import",
    "mfe.shared-state-cross-boundary",
  ]),
});

export const DEFAULT_REVIEW_CONFIGURATION: ResolvedReviewConfiguration = deepFreeze({
  version: 1,
  profile: "default",
  include: ["**/*"],
  exclude: ["node_modules/**", "dist/**", "coverage/**", ".git/**"],
  rules: { disabledFamilies: [], disabled: [], severity: {} },
  ai: { mode: "enabled" },
  qualityGate: { securityProfile: "security/default" },
});

export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
