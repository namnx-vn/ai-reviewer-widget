import type { ComplianceMappingDefinition, ComplianceCoverageState } from "./types";
import type { SecurityStandard, SecurityStandardMapping } from "../model/types";

export const DEFAULT_COMPLIANCE_MAPPINGS: readonly ComplianceMappingDefinition[] = [
  define("security.injection.command", "owasp-top-10", "A05:2025", "covered", "Interpreter injection is directly detected through source-to-sink evidence."),
  define("security.injection.sql", "owasp-top-10", "A05:2025", "covered", "SQL injection is directly detected through source-to-query evidence."),
  define("security.injection.nosql", "owasp-top-10", "A05:2025", "covered", "NoSQL injection is directly detected through modeled query sinks."),
  define("security.injection.command", "owasp-asvs", "v5.0.0-1.2.5", "covered", "ASVS 5.0.0 explicitly covers OS command injection prevention."),
  define("security.injection.sql", "owasp-asvs", "v5.0.0-1.2.4", "covered", "ASVS 5.0.0 covers parameterized database queries and database injection prevention."),
  define("security.injection.nosql", "owasp-asvs", "v5.0.0-1.2.4", "covered", "ASVS 5.0.0 covers SQL, NoSQL, and related database injection prevention."),
  define("security.auth.jwt-decode-without-verify", "owasp-top-10", "A07:2025", "covered", "JWT decode without verification is directly observable authentication evidence."),
  define("security.authz.client-side-only", "owasp-top-10", "A01:2025", "covered", "Client-only authorization decisions are directly observable."),
  define("security.authz.client-side-only", "owasp-asvs", "v5.0.0-8.3.1", "covered", "ASVS 5.0.0 requires authorization at a trusted service layer rather than client-side controls."),
  define("security.authz.idor-candidate", "owasp-top-10", "A01:2025", "manual-verification-required", "The analyzer emits an IDOR candidate when ownership enforcement cannot be proven locally."),
  define("security.authz.idor-candidate", "owasp-asvs", "v5.0.0-8.2.2", "manual-verification-required", "ASVS data-specific authorization maps directly to IDOR/BOLA, while candidate evidence still requires review."),
  define("security.authz.missing-resource-ownership", "owasp-asvs", "v5.0.0-8.2.2", "manual-verification-required", "Ownership evidence maps to data-specific authorization but full application enforcement requires review."),
  define("security.logging.secret", "owasp-top-10", "A09:2025", "partially-covered", "Sensitive logging detection contributes to logging security, but alerting and operations remain outside static analysis."),
  define("security.logging.credential", "owasp-asvs", "v5.0.0-14.2.4", "partially-covered", "ASVS data-protection controls include protection and access controls for sensitive data in logs."),
  define("security.logging.payment-data", "owasp-asvs", "v5.0.0-14.2.4", "partially-covered", "ASVS data-protection controls include protection and access controls for sensitive data in logs."),
  define("security.logging.pii", "owasp-asvs", "v5.0.0-14.2.4", "partially-covered", "ASVS data-protection controls include protection and access controls for sensitive data in logs."),
  define("security.error.stacktrace-exposure", "owasp-top-10", "A10:2025", "covered", "Exposed stack traces are an explicit exceptional-condition information disclosure pattern."),
  define("security.error.internal-detail", "owasp-top-10", "A10:2025", "covered", "Internal error detail exposed to clients is directly observable."),
  define("security.error.database-detail", "owasp-top-10", "A10:2025", "covered", "Database error detail exposed to clients is directly observable."),
  define("security.data.client-storage-sensitive", "owasp-asvs", "v5.0.0-14.3.3", "covered", "ASVS 5.0.0 explicitly restricts sensitive data in browser storage."),
  define("security.network.tls-verification-disabled", "owasp-top-10", "A04:2025", "partially-covered", "Explicit TLS verification disablement weakens cryptographic transport guarantees."),
  define("security.network.tls-verification-disabled", "pci-dss", "4.2.1", "partially-covered", "Certificate-verification evidence contributes to strong cryptography in transit, while deployment scope requires verification."),
  define("security.network.insecure-http", "pci-dss", "4.2.1", "partially-covered", "Cleartext transport is detected, while deployment termination and network scope require verification."),
  define("security.network.tls-verification-disabled", "nist-ssdf", "PW.7.2", "partially-covered", "The implementation weakness is detectable, while the SSDF practice also includes review and process controls."),
  define("security.ssrf.untrusted-url", "owasp-top-10", "A01:2025", "covered", "OWASP Top 10:2025 includes SSRF within Broken Access Control and the analyzer models untrusted URL flow to request sinks."),
  define("security.business.client-controlled-balance", "banking-policy", "BANK-LEDGER-AUTHORITY", "covered", "Client-controlled balance writes violate the authoritative-ledger policy."),
  define("security.business.client-controlled-fee", "banking-policy", "BANK-FEE-SERVER-CALC", "covered", "Transaction fees must be derived from trusted server-side policy."),
  define("security.business.transaction-idempotency", "banking-policy", "BANK-TXN-IDEMPOTENCY", "manual-verification-required", "Static analysis identifies missing visible idempotency evidence but cannot prove distributed deduplication behavior."),
  define("security.business.transaction-replay-risk", "banking-policy", "BANK-TXN-REPLAY", "manual-verification-required", "Replay protection may depend on infrastructure or event-processing state outside the analysis unit."),
  define("security.business.workflow-bypass", "banking-policy", "BANK-WORKFLOW-INTEGRITY", "partially-covered", "Visible privileged transitions are analyzed, while full workflow completeness needs manual verification."),
  define("security.react.sensitive-local-storage", "banking-policy", "BANK-BROWSER-NO-PERSISTENT-SECRETS", "covered", "Sensitive banking data in persistent browser storage is directly observable."),
  define("security.react.sensitive-local-storage", "owasp-asvs", "v5.0.0-14.3.3", "covered", "ASVS 5.0.0 explicitly restricts sensitive data in browser storage."),
  define("security.react.third-party-script", "pci-dss", "6.4.3", "partially-covered", "Payment-page script presence is observable; authorization, integrity, inventory, and justification require additional evidence."),
  define("security.react.unsafe-post-message", "banking-policy", "BANK-BROWSER-TRUST-BOUNDARY", "covered", "Wildcard postMessage targets violate the browser trust-boundary policy."),
  define("security.react.external-form-action", "banking-policy", "BANK-PAYMENT-SAME-ORIGIN", "covered", "External banking form destinations are directly observable."),
];

function define(
  ruleId: string,
  standard: SecurityStandard,
  id: string,
  coverage: ComplianceCoverageState,
  rationale: string,
): ComplianceMappingDefinition {
  const mapping: SecurityStandardMapping = { standard, id };
  return { ruleId, mapping, coverage, rationale };
}
