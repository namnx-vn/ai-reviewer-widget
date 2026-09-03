import { describe, expect, it } from "vitest";

import {
  ConfigurationError,
  DEFAULT_RULE_CATALOG,
  isPathIncluded,
  resolveReviewConfiguration,
} from "..";

describe("review configuration", () => {
  it("resolves missing configuration to explicit immutable defaults", () => {
    const resolved = resolveReviewConfiguration(undefined, DEFAULT_RULE_CATALOG);

    expect(resolved).toEqual({
      version: 1,
      profile: "default",
      projectProfiles: [],
      projectProfileMode: "legacy",
      projectProfileEvidence: [],
      include: ["**/*"],
      exclude: ["node_modules/**", "dist/**", "coverage/**", ".git/**"],
      rules: { disabledFamilies: [], disabled: [], severity: {} },
      ai: { mode: "enabled" },
      qualityGate: { securityProfile: "security/default" },
    });
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it("rejects unknown fields and unknown stable selection IDs with diagnostics", () => {
    expect(() => resolveReviewConfiguration({
      version: 1,
      unexpected: true,
      rules: { disabled: ["quality.does-not-exist"] },
    }, DEFAULT_RULE_CATALOG)).toThrow(ConfigurationError);

    try {
      resolveReviewConfiguration({
        version: 1,
        unexpected: true,
        rules: { disabled: ["quality.does-not-exist"] },
      }, DEFAULT_RULE_CATALOG);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      if (!(error instanceof ConfigurationError)) throw error;
      expect(error.diagnostics.map(({ code }) => code)).toEqual([
        "CONFIG_UNKNOWN_FIELD",
        "CONFIG_UNKNOWN_RULE",
      ]);
    }
  });

  it("composes profiles with explicit overrides taking precedence", () => {
    const resolved = resolveReviewConfiguration({
      version: 1,
      profile: "security-focused",
      rules: {
        disabledFamilies: ["performance"],
        severity: { "security.no-eval": "high" },
      },
    }, DEFAULT_RULE_CATALOG);

    expect(resolved.rules.disabledFamilies).toEqual(["performance"]);
    expect(resolved.rules.severity).toEqual({ "security.no-eval": "high" });
    expect(resolved.qualityGate.securityProfile).toBe("security/strict");
  });

  it("derives strict and performance-focused policy from existing capabilities", () => {
    const catalog = {
      ruleIds: [...DEFAULT_RULE_CATALOG.ruleIds, "performance.large-component"],
    };

    expect(resolveReviewConfiguration({ version: 1, profile: "strict" }, catalog))
      .toEqual(expect.objectContaining({
        rules: expect.objectContaining({ severity: { "quality.no-console": "medium" } }),
        qualityGate: { securityProfile: "security/strict" },
      }));
    expect(resolveReviewConfiguration({ version: 1, profile: "performance-focused" }, catalog).rules.severity)
      .toEqual({ "performance.large-component": "high" });
  });

  it("auto-detects composable project profiles with explainable evidence", () => {
    const catalog = {
      ruleIds: [...DEFAULT_RULE_CATALOG.ruleIds, "performance.large-component"],
    };
    const resolved = resolveReviewConfiguration({ version: 1, profile: "auto" }, catalog, {
      files: ["pnpm-workspace.yaml", "apps/web/next.config.ts", "packages/core/tsconfig.json"],
      packageNames: ["@demo/web", "@demo/core"],
      packageCount: 2,
      dependencies: ["next", "react", "jose", "@opentelemetry/api"],
    });

    expect(resolved.projectProfileMode).toBe("auto");
    expect(resolved.projectProfiles).toEqual([
      "monorepo",
      "nextjs-application",
      "react-application",
      "security-sensitive",
      "performance-sensitive",
    ]);
    expect(resolved.projectProfileEvidence.every(({ reasons }) => reasons.length > 0)).toBe(true);
    expect(resolved.qualityGate.securityProfile).toBe("security/strict");
    expect(resolved.rules.severity["performance.large-component"]).toBe("high");
  });

  it("lets explicit project profiles override automatic detection", () => {
    const resolved = resolveReviewConfiguration({
      version: 1,
      profile: ["node-service", "security-sensitive"],
    }, DEFAULT_RULE_CATALOG, {
      dependencies: ["next", "react"],
      packageCount: 2,
    });

    expect(resolved.projectProfileMode).toBe("explicit");
    expect(resolved.projectProfiles).toEqual(["node-service", "security-sensitive"]);
    expect(resolved.projectProfileEvidence).toEqual([
      { profile: "node-service", reasons: ["Selected explicitly by configuration."] },
      { profile: "security-sensitive", reasons: ["Selected explicitly by configuration."] },
    ]);
    expect(resolved.qualityGate.securityProfile).toBe("security/strict");
  });

  it("falls back safely when automatic detection has no known signals", () => {
    const resolved = resolveReviewConfiguration({ version: 1, profile: "auto" }, DEFAULT_RULE_CATALOG, {
      files: ["README.md"],
      dependencies: ["unknown-framework"],
    });

    expect(resolved.projectProfiles).toEqual([]);
    expect(resolved.projectProfileEvidence).toEqual([]);
  });

  it("matches normalized include and exclude glob patterns deterministically", () => {
    const config = resolveReviewConfiguration({
      version: 1,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**"],
    }, DEFAULT_RULE_CATALOG);

    expect(isPathIncluded("src/feature/example.ts", config)).toBe(true);
    expect(isPathIncluded("src/generated/model.ts", config)).toBe(false);
    expect(isPathIncluded("test/example.ts", config)).toBe(false);
  });
});
