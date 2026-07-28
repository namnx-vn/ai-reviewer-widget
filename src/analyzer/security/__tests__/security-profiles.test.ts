import { describe, expect, it } from "vitest";

import {
  applySecurityProfile,
  getSecurityProfile,
  resolveSecurityProfile,
  resolveSecurityRulePolicy,
} from "../policies";
import type { SecurityProfileDefinition } from "../policies";
import type { SecurityFinding } from "../model/types";

describe("security profiles", () => {
  it("resolves default -> strict -> financial -> banking inheritance deterministically", () => {
    const profile = getSecurityProfile("security/banking");
    expect(profile.lineage).toEqual([
      "security/default",
      "security/strict",
      "security/financial",
      "security/banking",
    ]);
    expect(profile.minimumConfidence).toBe("medium");
    expect(profile.transport).toMatchObject({
      requireTls: true,
      requireCertificateVerification: true,
      minimumTlsVersion: "1.2",
    });
    expect(profile.storage.allowedMechanisms).toEqual([
      "server-session",
      "http-only-cookie",
      "memory",
    ]);
    expect(profile.qualityGate.mandatoryRuleIds).toContain("security.injection.sql");
    expect(profile.qualityGate.mandatoryRuleIds).toContain("security.business.transaction-replay-risk");
    expect(profile.qualityGate.mandatoryRuleIds).toContain("security.secrets.refresh-token");
    expect(profile.qualityGate.mandatoryRuleIds).toContain("security.execution.no-eval");
    expect(profile.qualityGate.mandatoryRuleIds).toContain("security.ssrf.untrusted-request");
  });

  it("supports inherited rule enablement, disablement, severity, and confidence overrides", () => {
    const definitions: readonly SecurityProfileDefinition[] = [
      {
        id: "custom/base",
        minimumConfidence: "low",
        ruleOverrides: [{ ruleId: "security.example.rule", enabled: false, severity: "medium" }],
      },
      {
        id: "custom/child",
        extends: "custom/base",
        ruleOverrides: [{ ruleId: "security.example.rule", enabled: true, severity: "critical", minimumConfidence: "high" }],
      },
    ];
    const profile = resolveSecurityProfile("custom/child", definitions);
    expect(profile.ruleOverrides).toEqual([{
      ruleId: "security.example.rule",
      enabled: true,
      severity: "critical",
      minimumConfidence: "high",
    }]);
  });

  it("resolves effective rule policy for downstream policy consumers", () => {
    expect(resolveSecurityRulePolicy("security.injection.sql", "high", "security/banking")).toEqual({
      enabled: true,
      severity: "critical",
      minimumConfidence: "medium",
    });
    expect(resolveSecurityRulePolicy("security.ssrf.untrusted-request", "high", "security/banking")).toEqual({
      enabled: true,
      severity: "critical",
      minimumConfidence: "medium",
    });
  });

  it("applies banking severity policy without changing evidence, flow, or finding id", () => {
    const evidence = [{ message: "source-to-sink evidence" }];
    const flow = [{ kind: "sink", label: "SQL query", sinkKind: "sql-query" }] satisfies SecurityFinding["flow"];
    const finding = sampleFinding("security.injection.sql", "high", "high", evidence, flow);
    const [result] = applySecurityProfile([finding], "security/banking");
    expect(result?.severity).toBe("critical");
    expect(result?.id).toBe(finding.id);
    expect(result?.evidence).toBe(evidence);
    expect(result?.flow).toBe(flow);
  });

  it("filters findings below the profile confidence threshold", () => {
    const finding = sampleFinding("security.example.rule", "high", "low", [{ message: "evidence" }]);
    expect(applySecurityProfile([finding], "security/default")).toHaveLength(1);
    expect(applySecurityProfile([finding], "security/banking")).toHaveLength(0);
  });

  it("rejects duplicate, unknown, and circular profile definitions", () => {
    expect(() => resolveSecurityProfile("missing", [])).toThrow(/Unknown security profile/);
    expect(() => resolveSecurityProfile("a", [{ id: "a" }, { id: "a" }])).toThrow(/Duplicate security profile/);
    expect(() => resolveSecurityProfile("a", [{ id: "a", extends: "b" }, { id: "b", extends: "a" }])).toThrow(/Circular security profile inheritance/);
  });
});

function sampleFinding(
  ruleId: string,
  severity: SecurityFinding["severity"],
  confidence: SecurityFinding["confidence"],
  evidence: SecurityFinding["evidence"],
  flow?: SecurityFinding["flow"],
): SecurityFinding {
  return {
    id: `${ruleId}:example.ts:1`,
    ruleId,
    title: "Profile test finding",
    message: "Profile test.",
    severity,
    confidence,
    category: "business",
    location: { path: "example.ts", line: 1, column: 0 },
    evidence,
    flow,
  };
}
