import { describe, expect, it } from "vitest";

import { createSourceSecurityRuleRegistry } from "../../src/analyzer/security/review-findings";

describe("security production registry", () => {
  it("registers security families required by banking quality gates", () => {
    const ruleIds = new Set(
      createSourceSecurityRuleRegistry().getRules().map((rule) => rule.meta.id),
    );

    expect(ruleIds).toContain("security.execution.no-eval");
    expect(ruleIds).toContain("security.execution.no-new-function");
    expect(ruleIds).toContain("security.injection.command");
    expect(ruleIds).toContain("security.injection.sql");
    expect(ruleIds).toContain("security.xss.inner-html");
    expect(ruleIds).toContain("security.browser.post-message-origin");
    expect(ruleIds).toContain("security.crypto.insecure-random");
    expect(ruleIds).toContain("security.auth.jwt-decode-without-verify");
    expect(ruleIds).toContain("security.authz.client-side-only");
    expect(ruleIds).toContain("security.ssrf.untrusted-url");
    expect(ruleIds).toContain("security.logging.payment-data");
    expect(ruleIds).toContain("security.business.transaction-replay-risk");
  });
});
