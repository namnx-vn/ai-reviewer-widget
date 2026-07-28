import { describe, expect, it } from "vitest";

import { evaluateSecurityQualityGate } from "../quality-gate";
import { resolveSecurityProfile } from "../policies";
import type { SecurityQualityGateFinding } from "../quality-gate";

describe("security quality gate", () => {
  const evaluatedAt = "2026-07-27T12:00:00+07:00";

  it("fails new high findings under the banking profile", () => {
    const result = evaluateSecurityQualityGate({
      findings: [finding("security.example.high", "high", "high")],
      profile: "security/banking",
      evaluatedAt,
    });
    expect(result.decision).toBe("fail");
    expect(result.findings[0]).toMatchObject({
      state: "new",
      action: "fail",
      reasonCode: "blocking-severity",
    });
  });

  it("keeps baseline debt visible without blocking adoption", () => {
    const item = finding("security.example.high", "high", "high");
    const result = evaluateSecurityQualityGate({
      findings: [item],
      profile: "security/banking",
      evaluatedAt,
      baselineFindingIds: [item.id],
    });
    expect(result.decision).toBe("pass");
    expect(result.summary.baseline).toBe(1);
    expect(result.findings[0]?.action).toBe("baseline");
  });

  it("supports configurable medium-severity action", () => {
    const item = finding("security.example.medium", "medium", "high");
    const warning = evaluateSecurityQualityGate({
      findings: [item],
      profile: "security/banking",
      evaluatedAt,
    });
    const blocking = evaluateSecurityQualityGate({
      findings: [item],
      profile: "security/banking",
      evaluatedAt,
      severityActions: [{ severity: "medium", action: "fail" }],
    });
    expect(warning.decision).toBe("warn");
    expect(blocking.decision).toBe("fail");
  });

  it("supports category-level actions without weakening profile blockers", () => {
    const result = evaluateSecurityQualityGate({
      findings: [finding("security.example.logging", "medium", "high", "logging-1", "logging")],
      profile: "security/banking",
      evaluatedAt,
      categoryActions: [{ category: "logging", action: "fail" }],
    });
    expect(result.decision).toBe("fail");
    expect(result.findings[0]).toMatchObject({ action: "fail", reasonCode: "category-policy" });
  });

  it("reports new low findings without changing a passing decision", () => {
    const result = evaluateSecurityQualityGate({
      findings: [finding("security.example.low", "low", "high")],
      profile: "security/banking",
      evaluatedAt,
    });
    expect(result.decision).toBe("pass");
    expect(result.summary.reported).toBe(1);
    expect(result.findings[0]?.reasonCode).toBe("report-only-severity");
  });

  it("fails mandatory banking rules independent of non-blocking severity", () => {
    const result = evaluateSecurityQualityGate({
      findings: [finding("security.secrets.refresh-token", "medium", "high")],
      profile: "security/banking",
      evaluatedAt,
    });
    expect(result.decision).toBe("fail");
    expect(result.findings[0]?.reasonCode).toBe("mandatory-rule");
  });

  it("applies explicit suppressions and audits expiry deterministically", () => {
    const item = finding("security.example.high", "high", "high");
    const active = evaluateSecurityQualityGate({
      findings: [item],
      profile: "security/banking",
      evaluatedAt,
      suppressions: [{
        findingId: item.id,
        reason: "Accepted migration risk",
        owner: "security-team",
        expiresAt: "2026-07-28T00:00:00+07:00",
      }],
    });
    const expired = evaluateSecurityQualityGate({
      findings: [item],
      profile: "security/banking",
      evaluatedAt: "2026-07-28T00:00:00+07:00",
      suppressions: [{
        findingId: item.id,
        reason: "Accepted migration risk",
        owner: "security-team",
        expiresAt: "2026-07-28T00:00:00+07:00",
      }],
    });

    expect(active.decision).toBe("pass");
    expect(active.findings[0]?.state).toBe("suppressed");
    expect(active.suppressions[0]).toMatchObject({ expired: false, matchedFindingIds: [item.id] });
    expect(expired.decision).toBe("fail");
    expect(expired.suppressions[0]?.expired).toBe(true);
  });

  it("supports auditable rule-level suppressions", () => {
    const result = evaluateSecurityQualityGate({
      findings: [
        finding("security.example.rule", "high", "high", "a"),
        finding("security.example.rule", "high", "high", "b"),
      ],
      profile: "security/banking",
      evaluatedAt,
      suppressions: [{ ruleId: "security.example.rule", reason: "Compensating control SEC-42" }],
    });
    expect(result.decision).toBe("pass");
    expect(result.summary.suppressed).toBe(2);
    expect(result.suppressions[0]?.matchedFindingIds).toEqual(["a", "b"]);
  });

  it("honors profile disablement and confidence thresholds", () => {
    const profile = resolveSecurityProfile("custom", [{
      id: "custom",
      minimumConfidence: "medium",
      qualityGate: { minimumConfidence: "high", failOnSeverities: ["high"] },
      ruleOverrides: [{ ruleId: "security.disabled", enabled: false }],
    }]);
    const result = evaluateSecurityQualityGate({
      findings: [
        finding("security.disabled", "high", "high", "a"),
        finding("security.low-confidence", "high", "medium", "b"),
      ],
      profile,
      evaluatedAt,
    });
    expect(result.decision).toBe("pass");
    expect(result.findings.map((item) => item.reasonCode)).toEqual([
      "profile-disabled",
      "below-gate-confidence",
    ]);
  });

  it("orders findings and reasons deterministically", () => {
    const first = evaluateSecurityQualityGate({
      findings: [
        finding("security.z", "medium", "high", "z"),
        finding("security.a", "low", "high", "a"),
      ],
      profile: "security/default",
      evaluatedAt,
    });
    const second = evaluateSecurityQualityGate({
      findings: [
        finding("security.a", "low", "high", "a"),
        finding("security.z", "medium", "high", "z"),
      ],
      profile: "security/default",
      evaluatedAt,
    });
    expect(first).toEqual(second);
    expect(first.reasons.map((reason) => reason.findingId)).toEqual(["a", "z"]);
  });

  it("rejects duplicate finding fingerprints", () => {
    expect(() => evaluateSecurityQualityGate({
      findings: [
        finding("security.example.a", "high", "high", "duplicate"),
        finding("security.example.b", "medium", "high", "duplicate"),
      ],
      profile: "security/banking",
      evaluatedAt,
    })).toThrow(/Duplicate security quality-gate finding id/);
  });

  it("rejects invalid suppression, duplicate action, and timestamp inputs", () => {
    expect(() => evaluateSecurityQualityGate({
      findings: [],
      profile: "security/default",
      evaluatedAt: "not-a-date",
    })).toThrow(/Invalid evaluatedAt timestamp/);

    expect(() => evaluateSecurityQualityGate({
      findings: [],
      profile: "security/default",
      evaluatedAt,
      suppressions: [{ reason: "missing target" }],
    })).toThrow(/requires findingId or ruleId/);

    expect(() => evaluateSecurityQualityGate({
      findings: [],
      profile: "security/default",
      evaluatedAt,
      categoryActions: [
        { category: "logging", action: "warn" },
        { category: "logging", action: "fail" },
      ],
    })).toThrow(/Duplicate security quality-gate action for category/);
  });
});

function finding(
  ruleId: string,
  severity: SecurityQualityGateFinding["severity"],
  confidence: SecurityQualityGateFinding["confidence"],
  id = `${ruleId}:src/example.ts:1`,
  category?: SecurityQualityGateFinding["category"],
): SecurityQualityGateFinding {
  return { id, ruleId, severity, confidence, category };
}
