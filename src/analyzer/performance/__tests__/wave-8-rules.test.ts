import { describe, expect, it } from "vitest";
import { parseSource } from "../../ast/parser";
import {
  bankUiPerformanceRules,
  observabilityPerformanceRules,
  PerformanceAnalysisEngine,
  PerformanceRuleRegistry,
  transactionPerformanceRules,
  type PerformanceRule,
} from "..";

function ids(
  source: string,
  rules: readonly PerformanceRule[],
  options: {
    readonly criticalEntrypoints?: readonly string[];
    readonly criticalUiComponents?: readonly string[];
    readonly telemetryCallPaths?: readonly string[];
  } = {},
): readonly string[] {
  const registry = new PerformanceRuleRegistry();
  rules.forEach((rule) => registry.register(rule));
  return new PerformanceAnalysisEngine().analyze({
    source,
    file: "payment.tsx",
    ast: parseSource(source),
    ...options,
  }, registry).map((finding) => finding.ruleId);
}

describe("wave 8 performance rules", () => {
  it("requires configured banking entrypoints", () => {
    const source = "function submitPayment(){ return fetch('/pay'); }";
    expect(ids(source, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .toContain("performance.transaction.external-call-in-critical-section");
    expect(ids(source, transactionPerformanceRules)).toEqual([]);
  });

  it("supports configured arrow-function banking entrypoints", () => {
    const source = "const submitPayment = async () => fetch('/pay');";
    expect(ids(source, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .toContain("performance.transaction.external-call-in-critical-section");
  });

  it("does not report independent-work findings for data-dependent awaits", () => {
    const source = `
      async function submitPayment() {
        const response = await fetch("/token");
        await fetch(response.url);
      }
    `;
    expect(ids(source, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .not.toContain("performance.transaction.sequential-independent-work");
  });

  it("does not report excessive roundtrips below the configured structural threshold", () => {
    const source = `
      async function submitPayment() {
        await fetch("/one");
        await fetch("/two");
      }
    `;
    expect(ids(source, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .not.toContain("performance.transaction.excessive-roundtrips");
  });

  it("accepts idempotency evidence for retried non-idempotent requests", () => {
    const source = `
      async function submitPayment() {
        for (;;) {
          await fetch("/pay", {
            method: "POST",
            headers: { "Idempotency-Key": "payment-123" },
          });
          break;
        }
      }
    `;
    expect(ids(source, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .not.toContain("performance.transaction.non-idempotent-retry");
  });

  it("detects dynamic critical-path fan-out but accepts bounded literal fan-out", () => {
    expect(ids(`
      async function submitPayment(items) {
        await Promise.all(items.map(run));
      }
    `, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .toContain("performance.transaction.unbounded-fanout");

    expect(ids(`
      async function submitPayment() {
        await Promise.all([run("one"), run("two")]);
      }
    `, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .not.toContain("performance.transaction.unbounded-fanout");
  });

  it("detects nested CPU work on a configured critical path", () => {
    const source = `
      function submitPayment(accounts, entries) {
        for (const account of accounts) {
          for (const entry of entries) {
            consume(account, entry);
          }
        }
      }
    `;
    expect(ids(source, transactionPerformanceRules, { criticalEntrypoints: ["submitPayment"] }))
      .toContain("performance.transaction.blocking-cpu-work");
  });

  it("requires a configured telemetry adapter before observability checks", () => {
    const source = "function submitPayment(){ return fetch('/pay'); }";
    expect(ids(source, observabilityPerformanceRules, {
      criticalEntrypoints: ["submitPayment"],
      telemetryCallPaths: ["telemetry.span"],
    })).toContain("performance.observability.external-call-without-timing-context");
    expect(ids(source, observabilityPerformanceRules, { criticalEntrypoints: ["submitPayment"] })).toEqual([]);
  });

  it("checks configured critical UI components only", () => {
    const source = "function PaymentForm(){ return items.sort(); }";
    expect(ids(source, bankUiPerformanceRules, { criticalUiComponents: ["PaymentForm"] }))
      .toEqual(["performance.bank-ui.blocking-critical-render"]);
  });
});
