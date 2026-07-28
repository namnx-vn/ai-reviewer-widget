import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import { SecurityAnalysisEngine } from "../engine/security-analysis-engine";
import { SecurityRuleRegistry } from "../registry/security-rule-registry";
import { businessSecurityRules } from "../rules/business";

function analyze(source: string) {
  const registry = new SecurityRuleRegistry();
  for (const rule of businessSecurityRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({ source, file: "src/transfer.ts", ast: parseSource(source) }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.17 business logic security", () => {
  it("publishes the stable initial business rule set", () => {
    expect(businessSecurityRules.map((rule) => rule.meta.id)).toEqual([
      "security.business.client-controlled-fee",
      "security.business.client-controlled-balance",
      "security.business.client-controlled-authority",
      "security.business.transaction-idempotency",
      "security.business.transaction-replay-risk",
      "security.business.workflow-bypass",
      "security.business.unvalidated-transaction-amount",
    ]);
  });

  it.each([
    ["client fee", "await createTransfer({ fee: req.body.fee });", "security.business.client-controlled-fee"],
    ["client balance", "await updateBalance({ balance: req.body.balance });", "security.business.client-controlled-balance"],
    ["client authority", "await authorizeTransaction({ authority: req.body.authority });", "security.business.client-controlled-authority"],
    ["idempotency candidate", "await processPayment({ amount: req.body.amount });", "security.business.transaction-idempotency"],
    ["replay candidate", "await processPayment(req.body);", "security.business.transaction-replay-risk"],
    ["workflow bypass", "await transitionTransaction({ status: req.body.status });", "security.business.workflow-bypass"],
    ["unvalidated amount", "await executeTransfer({ amount: req.body.amount });", "security.business.unvalidated-transaction-amount"],
  ])("detects %s", (_name, source, ruleId) => {
    expect(ruleIds(source)).toContain(ruleId);
  });

  it("supports interprocedural amount propagation", () => {
    expect(ruleIds(`
      function execute(amount: number) {
        return processPayment({ amount });
      }
      execute(req.body.amount);
    `)).toContain("security.business.unvalidated-transaction-amount");
  });

  it("accepts server-side fee calculation and amount normalization", () => {
    const ids = ruleIds(`
      const fee = calculateFee(req.body.amount);
      const amount = normalizeAmount(req.body.amount);
      await createTransfer({ fee, amount, idempotencyKey: req.headers.idempotencyKey });
    `);
    expect(ids).not.toContain("security.business.client-controlled-fee");
    expect(ids).not.toContain("security.business.unvalidated-transaction-amount");
    expect(ids).not.toContain("security.business.transaction-idempotency");
  });

  it("does not treat request amount alone as a vulnerability", () => {
    expect(ruleIds("const amount = req.body.amount; return amount;")).toEqual([]);
  });

  it("keeps incomplete transaction candidates at medium confidence", () => {
    const finding = analyze("await processPayment({ amount: req.body.amount });")
      .find((item) => item.ruleId === "security.business.transaction-idempotency");
    expect(finding?.confidence).toBe("medium");
  });
});
