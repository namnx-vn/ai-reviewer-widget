import { describe, expect, it } from "vitest";

import {
  ComplianceRegistry,
  attachComplianceMappings,
  createComplianceReport,
  isValidSecurityStandardMapping,
} from "../../src/analyzer/security/compliance";
import type { ComplianceMappingDefinition } from "../../src/analyzer/security/compliance";
import type { SecurityFinding } from "../../src/analyzer/security/model/types";

describe("security compliance mapping", () => {
  it("validates supported standard identifiers", () => {
    expect(isValidSecurityStandardMapping({ standard: "cwe", id: "CWE-89" })).toBe(true);
    expect(isValidSecurityStandardMapping({ standard: "owasp-top-10", id: "A05:2025" })).toBe(true);
    expect(isValidSecurityStandardMapping({ standard: "owasp-top-10", id: "A03:2021" })).toBe(true);
    expect(isValidSecurityStandardMapping({ standard: "owasp-asvs", id: "v5.0.0-1.2.5" })).toBe(true);
    expect(isValidSecurityStandardMapping({ standard: "pci-dss", id: "6.4.3" })).toBe(true);
    expect(isValidSecurityStandardMapping({ standard: "nist-ssdf", id: "PW.7.2" })).toBe(true);
    expect(isValidSecurityStandardMapping({ standard: "banking-policy", id: "BANK-TXN-IDEMPOTENCY" })).toBe(true);
    expect(isValidSecurityStandardMapping({ standard: "owasp-asvs", id: "V5.3" })).toBe(false);
    expect(isValidSecurityStandardMapping({ standard: "pci-dss", id: "PCI-6" })).toBe(false);
  });

  it("rejects invalid and duplicate centralized mappings", () => {
    expect(() => new ComplianceRegistry([{
      ruleId: "security.injection.sql",
      mapping: { standard: "pci-dss", id: "invalid" },
      coverage: "covered",
      rationale: "test",
    }])).toThrow(/Invalid pci-dss control id/);

    const definition: ComplianceMappingDefinition = {
      ruleId: "security.injection.sql",
      mapping: { standard: "owasp-top-10", id: "A05:2025" },
      coverage: "covered",
      rationale: "Injection mapping.",
    };
    expect(() => new ComplianceRegistry([definition, definition])).toThrow(/Duplicate compliance mapping/);
  });

  it("merges centralized mappings without duplicating rule-provided standards", () => {
    const registry = new ComplianceRegistry([{
      ruleId: "security.injection.sql",
      mapping: { standard: "cwe", id: "CWE-89" },
      coverage: "covered",
      rationale: "SQL injection mapping.",
    }]);
    const finding = sampleFinding("security.injection.sql", [{ standard: "cwe", id: "CWE-89" }]);
    const enriched = attachComplianceMappings(finding, registry);
    expect(enriched.standards).toEqual([{ standard: "cwe", id: "CWE-89" }]);
    expect(enriched.evidence).toBe(finding.evidence);
  });

  it("aggregates coverage deterministically and uses non-certifying wording", () => {
    const registry = new ComplianceRegistry([
      {
        ruleId: "security.authz.idor-candidate",
        mapping: { standard: "owasp-top-10", id: "A01:2025" },
        coverage: "manual-verification-required",
        rationale: "Ownership needs review.",
      },
      {
        ruleId: "security.authz.client-side-only",
        mapping: { standard: "owasp-top-10", id: "A01:2025" },
        coverage: "covered",
        rationale: "Client authorization is observable.",
      },
    ]);
    const report = createComplianceReport([
      sampleFinding("security.authz.client-side-only"),
      sampleFinding("security.authz.idor-candidate"),
    ], registry);

    expect(report.controls).toEqual([{
      standard: "owasp-top-10",
      id: "A01:2025",
      control: undefined,
      coverage: "manual-verification-required",
      ruleIds: ["security.authz.client-side-only", "security.authz.idor-candidate"],
    }]);
    expect(report.summary.manualVerificationRequired).toBe(1);
    expect(report.disclaimer).toContain("do not establish certification");
    expect(report.disclaimer.toLowerCase()).not.toMatch(/^pci compliant|^asvs compliant|^bank compliant/);
  });
});

function sampleFinding(
  ruleId: string,
  standards?: SecurityFinding["standards"],
): SecurityFinding {
  return {
    id: `${ruleId}:example.ts:1`,
    ruleId,
    title: "Test finding",
    message: "Test finding message.",
    severity: "high",
    confidence: "high",
    category: "compliance",
    location: { path: "example.ts", line: 1, column: 0 },
    evidence: [{ message: "Deterministic evidence." }],
    standards,
  };
}
