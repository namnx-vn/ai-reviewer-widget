import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import { SecurityAnalysisEngine } from "../engine/security-analysis-engine";
import { SecurityRuleRegistry } from "../registry/security-rule-registry";
import { securityConfigurationRules } from "../rules/configuration";

function analyze(source: string) {
  const registry = new SecurityRuleRegistry();
  for (const rule of securityConfigurationRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({
    source,
    file: "src/config.ts",
    ast: parseSource(source),
  }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.13 security configuration", () => {
  it("registers stable configuration rule IDs", () => {
    expect(securityConfigurationRules.map((rule) => rule.meta.id)).toEqual([
      "security.config.debug-enabled",
      "security.config.production-stacktrace",
      "security.config.cors-wildcard",
      "security.config.default-credential",
      "security.config.unsafe-csp",
      "security.config.production-source-map",
      "security.config.admin-interface",
      "security.config.development-mode",
    ]);
  });

  it("reports explicit production debug and stack trace settings, not dynamic values", () => {
    const source = `
      import express from "express";
      const app = express();
      app.set("env", "production");
      app.set("debug", true);
      app.set("showStackError", true);
      app.set("debug", enabled);
    `;
    const ids = ruleIds(source);
    expect(ids).toContain("security.config.debug-enabled");
    expect(ids).toContain("security.config.production-stacktrace");
    expect(ids.filter((id) => id === "security.config.debug-enabled")).toHaveLength(1);
  });

  it("reports explicit wildcard CORS through a known cors alias only", () => {
    const source = `
      import makeCors from "cors";
      app.use(makeCors({ origin: "*" }));
      app.use(makeCors({ origin: configuredOrigin }));
      middleware({ origin: "*" });
    `;
    expect(ruleIds(source).filter((id) => id === "security.config.cors-wildcard")).toHaveLength(1);
  });

  it("reports known basic auth default credentials without treating arbitrary object data as credentials", () => {
    const source = `
      import basicAuth from "express-basic-auth";
      app.use(basicAuth({ users: { admin: "admin" } }));
      const sample = { username: "admin", password: "admin" };
    `;
    expect(ruleIds(source)).toContain("security.config.default-credential");
    expect(ruleIds(source).filter((id) => id === "security.config.default-credential")).toHaveLength(1);
  });

  it("reports disabled and explicitly unsafe Helmet CSP directives", () => {
    const source = `
      import helmet from "helmet";
      app.use(helmet({ contentSecurityPolicy: false }));
      app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["*"], scriptSrc: ["'unsafe-inline'"] } } }));
      app.use(helmet({ contentSecurityPolicy: configuredPolicy }));
    `;
    expect(ruleIds(source).filter((id) => id === "security.config.unsafe-csp")).toHaveLength(2);
  });

  it("only reports source maps where a production webpack mode is explicit", () => {
    const source = `
      export default { mode: "production", devtool: "source-map" };
      const development = { mode: "development", devtool: "source-map" };
      const dynamic = { mode: environment, devtool: "source-map" };
    `;
    expect(ruleIds(source).filter((id) => id === "security.config.production-source-map")).toHaveLength(1);
  });

  it("reports an explicit admin route and development mode on a known Express app", () => {
    const source = `
      import express from "express";
      const app = express();
      app.use("/admin", adminRouter);
      app.set("env", "development");
      app.use(adminPath, adminRouter);
    `;
    const ids = ruleIds(source);
    expect(ids).toContain("security.config.admin-interface");
    expect(ids).toContain("security.config.development-mode");
    expect(ids.filter((id) => id === "security.config.admin-interface")).toHaveLength(1);
  });

  it("produces deterministic findings", () => {
    const source = `import helmet from "helmet"; app.use(helmet({ contentSecurityPolicy: false }));`;
    expect(analyze(source)).toEqual(analyze(source));
  });
});
