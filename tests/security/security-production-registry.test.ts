import { describe, expect, it } from "vitest";

import { createSourceSecurityRuleRegistry } from "../../src/analyzer/security/review-findings";

describe("security production registry", () => {
  it("registers security families required by banking quality gates", () => {
    const ruleIds = new Set(
      createSourceSecurityRuleRegistry().getRules().map((rule) => rule.meta.id),
    );

    expect(ruleIds.has("security.execution.no-eval")).toBe(true);
    expect(ruleIds.has("security.execution.no-new-function")).toBe(true);
    expect(ruleIds.has("security.injection.command")).toBe(true);
    expect(ruleIds.has("security.injection.sql")).toBe(true);
    expect(ruleIds.has("security.xss.inner-html")).toBe(true);
    expect(ruleIds.has("security.browser.post-message-origin")).toBe(true);
    expect(ruleIds.has("security.crypto.insecure-random")).toBe(true);
    expect(ruleIds.has("security.auth.jwt-decode-without-verify")).toBe(true);
    expect(ruleIds.has("security.authz.client-side-only")).toBe(true);
    expect(ruleIds.has("security.ssrf.untrusted-request")).toBe(true);
    expect(ruleIds.has("security.logging.payment-data")).toBe(true);
    expect(ruleIds.has("security.business.transaction-replay-risk")).toBe(true);
  });
});
