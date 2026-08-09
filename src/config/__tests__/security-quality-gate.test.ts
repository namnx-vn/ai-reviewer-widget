import { describe, expect, it } from "vitest";

import { createPullRequestSecurityGateConfig } from "../security-quality-gate";

describe("pull request security quality-gate config", () => {
  it("defaults to banking and parses auditable baseline and suppressions", () => {
    const result = createPullRequestSecurityGateConfig({
      SECURITY_GATE_BASELINE_IDS: "finding-2, finding-1",
      SECURITY_GATE_SUPPRESSIONS_JSON: JSON.stringify([{
        ruleId: "security.test.rule",
        reason: "Risk accepted by security owner",
        owner: "appsec",
        expiresAt: "2026-12-31T00:00:00.000Z",
      }]),
    }, "2026-08-31T10:00:00.000Z");

    expect(result.profile).toBe("security/banking");
    expect(result.baselineFindingIds).toEqual(["finding-2", "finding-1"]);
    expect(result.suppressions[0]).toEqual(expect.objectContaining({ owner: "appsec" }));
  });

  it("rejects malformed or unauditable policy input", () => {
    expect(() => createPullRequestSecurityGateConfig({
      SECURITY_GATE_PROFILE: "security/unknown",
    }, "2026-08-31T10:00:00.000Z")).toThrow(/profile/i);

    expect(() => createPullRequestSecurityGateConfig({
      SECURITY_GATE_SUPPRESSIONS_JSON: '[{"ruleId":"security.test.rule","reason":""}]',
    }, "2026-08-31T10:00:00.000Z")).toThrow(/reason/i);
  });
});
