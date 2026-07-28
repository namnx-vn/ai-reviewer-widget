import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import { SecurityAnalysisEngine } from "../engine/security-analysis-engine";
import type { SecurityFinding, SecurityRule } from "../model/types";
import { SecurityRuleRegistry } from "../registry/security-rule-registry";
import { authorizationRules } from "../rules/authorization";

function analyze(source: string): readonly SecurityFinding[] {
  const registry = new SecurityRuleRegistry();
  for (const rule of authorizationRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({ source, file: "src/authorization.ts", ast: parseSource(source) }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.7 authorization intelligence", () => {
  it("publishes the stable authorization rule set", () => {
    expect(authorizationRules.map((rule: SecurityRule) => rule.meta.id)).toEqual([
      "security.authz.client-side-only",
      "security.authz.role-from-untrusted-input",
      "security.authz.permission-from-untrusted-input",
      "security.authz.mass-assignment",
      "security.authz.missing-resource-ownership",
      "security.authz.idor-candidate",
      "security.authz.privilege-escalation",
    ]);
  });

  it.each([
    ["client-side authorization", `'use client'; if (localStorage.getItem("role") === "admin") { deleteAccount(); }`, "security.authz.client-side-only"],
    ["untrusted role", `const role = req.body.role; user.role = role;`, "security.authz.role-from-untrusted-input"],
    ["wrapped untrusted permission", `function applyPermission(value: string) { account.permission = value; } applyPermission(req.body.permission);`, "security.authz.permission-from-untrusted-input"],
    ["mass assignment", `await users.update(req.body);`, "security.authz.mass-assignment"],
    ["privilege escalation", `await users.update({ role: req.body.role });`, "security.authz.privilege-escalation"],
    ["ownership candidate", `await accounts.update({ where: { id: req.params.id }, data: { name: req.body.name } });`, "security.authz.missing-resource-ownership"],
    ["IDOR candidate", `const account = await accounts.findById(req.params.id); return account;`, "security.authz.idor-candidate"],
  ])("detects %s", (_name, source, ruleId) => expect(ruleIds(source)).toContain(ruleId));

  it("keeps incomplete ownership findings at medium confidence", () => {
    const findings = analyze(`const account = await accounts.findById(req.params.id); return account;`);
    const finding = findings.find((item) => item.ruleId === "security.authz.idor-candidate");
    expect(finding?.confidence).toBe("medium");
  });

  it("does not report request role after explicit allowlist validation", () => {
    expect(ruleIds(`
      const role = assertAllowedRole(req.body.role);
      user.role = role;
    `)).not.toContain("security.authz.role-from-untrusted-input");
  });

  it("does not report ownership candidates when access is explicitly bound to the principal", () => {
    expect(ruleIds(`
      const account = await accounts.findOne({ id: req.params.id, ownerId: req.user.id });
      await authorize(req.user, account);
      return account;
    `)).not.toContain("security.authz.idor-candidate");
  });

  it("does not report explicit field mapping as mass assignment", () => {
    expect(ruleIds(`
      await users.update({ name: req.body.name, displayName: req.body.displayName });
    `)).not.toContain("security.authz.mass-assignment");
  });
});
