import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import { SecurityAnalysisEngine } from "../engine/security-analysis-engine";
import { SecurityRuleRegistry } from "../registry/security-rule-registry";
import { loggingErrorRules } from "../rules/logging";

function analyze(source: string) {
  const registry = new SecurityRuleRegistry();
  for (const rule of loggingErrorRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({ source, file: "src/handler.ts", ast: parseSource(source) }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.14 logging and error security", () => {
  it("publishes the stable logging and error rule set", () => {
    expect(loggingErrorRules.map((rule) => rule.meta.id)).toEqual([
      "security.logging.secret",
      "security.logging.credential",
      "security.logging.payment-data",
      "security.logging.pii",
      "security.error.stacktrace-exposure",
      "security.error.internal-detail",
      "security.error.database-detail",
    ]);
  });

  it.each([
    ["secret", "logger.info(req.body.apiKey);", "security.logging.secret"],
    ["credential", "console.error(req.body.password);", "security.logging.credential"],
    ["payment data", "logger.warn(req.body.pan);", "security.logging.payment-data"],
    ["PII", "logger.info(req.body.email);", "security.logging.pii"],
    ["stack trace", "res.json({ stack: error.stack });", "security.error.stacktrace-exposure"],
    ["internal detail", "reply.send({ message: err.message });", "security.error.internal-detail"],
    ["database detail", "Response.json({ detail: dbError.constraint });", "security.error.database-detail"],
  ])("detects %s", (_name, source, ruleId) => {
    expect(ruleIds(source)).toContain(ruleId);
  });

  it("honors explicit redaction before logging", () => {
    expect(ruleIds("logger.info(redact(req.body.password));")).not.toContain("security.logging.credential");
  });

  it("does not report generic client-safe errors or unrelated logs", () => {
    expect(ruleIds(`
      logger.info("request completed");
      res.status(500).json({ error: "Internal server error" });
    `)).toEqual([]);
  });

  it("never copies captured sensitive values into evidence", () => {
    const source = 'logger.info(req.body.password);';
    const findings = analyze(source);
    expect(JSON.stringify(findings)).not.toContain("req.body.password");
  });
});
