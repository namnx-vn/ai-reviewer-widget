import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import { SecurityAnalysisEngine } from "../../src/analyzer/security/engine/security-analysis-engine";
import { SecurityRuleRegistry } from "../../src/analyzer/security/registry/security-rule-registry";
import { objectSecurityRules } from "../../src/analyzer/security/rules/object";

function analyze(source: string): readonly string[] {
  const registry = new SecurityRuleRegistry();
  for (const rule of objectSecurityRules) registry.register(rule);
  return new SecurityAnalysisEngine()
    .analyze({ source, file: "src/object.ts", ast: parseSource(source) }, registry)
    .map((finding) => finding.ruleId);
}

describe("phase 3.6.16 object security", () => {
  it.each([
    ["direct __proto__ write", "target.__proto__ = req.body.value;", "security.object.prototype-pollution"],
    ["constructor prototype write", "target.constructor.prototype.enabled = true;", "security.object.constructor-prototype"],
    ["unsafe deep merge", "merge(target, req.body);", "security.object.unsafe-deep-merge"],
    ["unsafe Object.assign", "Object.assign(target, req.body);", "security.object.unsafe-object-assign"],
    ["tainted computed key", "target[req.query.key] = value;", "security.object.untrusted-dynamic-key"],
  ])("detects %s", (_name, source, ruleId) => {
    expect(analyze(source)).toContain(ruleId);
  });

  it("tracks request key aliases through shared taint flow", () => {
    expect(analyze("const key = req.query.key; target[key] = value;")).toContain(
      "security.object.untrusted-dynamic-key",
    );
  });

  it("does not flag normal computed properties, safe sources, or guarded keys", () => {
    const source = `
      const key = "theme";
      target[key] = value;
      target[user.preference] = value;
      const input = req.query.key;
      if (["theme", "locale"].includes(input)) target[input] = value;
      Object.assign(target, { theme: "dark" });
      target.constructor.name = "Widget";
    `;
    expect(analyze(source)).toEqual([]);
  });

  it("recognizes aliases for known merge APIs", () => {
    expect(analyze("const payload = req.body; const assign = Object.assign; assign(target, payload);")).toContain(
      "security.object.unsafe-object-assign",
    );
  });
});
