import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import { sensitiveDataRules } from "../rules/data";

function analyze(source: string) {
  const ast = parseSource(source);
  const context = { source, file: "src/payments.ts", ast };
  return sensitiveDataRules.flatMap((rule) => rule.check(context));
}

describe("phase 3.6.9 sensitive data protection", () => {
  it("tracks multiple sensitive classifications into all exposure sinks", () => {
    const findings = analyze(`
      const password = request.body.password;
      const pan = request.body.pan;
      console.log(password);
      fetch('/pay?pan=' + pan);
      localStorage.setItem('draft', password);
      Sentry.captureMessage(password);
      analytics.track('pay', { pan });
      throw new Error(password);
      fs.writeFileSync('draft.txt', pan);
      navigator.clipboard.writeText(password);
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.data.log-sensitive",
      "security.data.url-sensitive",
      "security.data.client-storage-sensitive",
      "security.data.telemetry-sensitive",
      "security.data.analytics-sensitive",
      "security.data.error-sensitive",
      "security.data.unencrypted-persistence",
      "security.data.clipboard-sensitive",
    ]);
    expect(findings.flatMap((finding) => finding.evidence).map((item) => item.message).join(" "))
      .not.toContain("request.body.password");
  });

  it("propagates classified values through aliases and object properties", () => {
    const findings = analyze(`
      const otp = request.body.otp;
      const payload = { code: otp };
      const copied = payload.code;
      console.error(copied);
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("security.data.log-sensitive");
    expect(findings[0]?.flow?.map((step) => step.label)).toContain("Sensitive data log sink");
  });

  it("does not report redacted flows, unrelated identifiers, or safe local URLs", () => {
    expect(analyze(`
      const password = request.body.password;
      console.log("[REDACTED]");
      const compass = "north";
      console.log(compass);
      fetch('https://localhost.example.test/docs');
    `)).toEqual([]);
  });

  it("is deterministic and never emits sensitive source text", () => {
    const source = `const cvv = request.body.cvv; analytics.track('x', { cvv });`;
    const first = analyze(source);
    expect(first).toEqual(analyze(source));
    expect(JSON.stringify(first)).not.toContain("request.body.cvv");
  });
});
