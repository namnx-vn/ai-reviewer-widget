import type { ComplianceMappingDefinition, ComplianceCoverageState } from "./types";
import type { SecurityStandard, SecurityStandardMapping } from "../model/types";

export const DEFAULT_COMPLIANCE_MAPPINGS: readonly ComplianceMappingDefinition[] = [
  define("security.injection.command", "owasp-top-10", "A03:2021", "covered", "Interpreter injection is directly detected through source-to-sink evidence."),
  define("security.injection.sql", "owasp-top-10", "A03:2021", "covered", "SQL injection is directly detected through source-to-query evidence."),
  define("security.injection.nosql", "owasp-top-10", "A03:2021", "covered", "NoSQL injection is directly detected through modeled query sinks."),
  define("security.injection.command", "owasp-asvs", "V5.3", "covered", "Command interpreter input is analyzed deterministically."),
  define("security.injection.sql", "owasp-asvs", "V5.3", "covered", "Database interpreter input is analyzed deterministically."),
  define("security.auth.jwt-decode-without-verify", "owasp-top-10", "A07:2021", "covered", "JWT decode without verification is directly observable."),
  define("security.auth.oauth-state-missing", "owasp-asvs", "V2.10", "partially-covered", "Static analysis covers visible OAuth state configuration but cannot prove the complete authorization flow."),
  define("security.auth.oauth-pkce-missing", "owasp-asvs", "V2.10", "partially-covered", "Static analysis covers visible PKCE configuration but cannot prove every identity-provider behavior."),
  define("security.authz.client-side-only", "owasp-top-10", "A01:2021", "covered", "Client-only authorization decisions are directly observable."),
  define("security.authz.idor-candidate", "owasp-top-10", "A01:2021", "manual-verification-required", "The analyzer emits an IDOR candidate when ownership enforcement cannot be proven locally."),
  define("security.authz.missing-resource-ownership", "owasp-asvs", "V4.2", "manual-verification-required", "Ownership evidence is analyzed but full application authorization requires review."),
  define("security.secrets.api-key", "owasp-top-10", "A02:2021", "covered", "Embedded API key material is detected and redacted."),
  define("security.secrets.private-key", "owasp-top-10", "A02:2021", "covered", "Embedded private key material is detected and redacted."),
  define("security.logging.credential", "pci-dss", "3.5.1", "partially-covered", "Credential exposure is detectable, while complete stored-account-data protection remains broader than static analysis."),
  define("security.logging.payment-data", "pci-dss", "3.5.1", "partially-covered", "Payment-data logging is detectable, while complete protection requirements require operational verification."),
  define("security.data.client-storage-sensitive", "owasp-asvs", "V8.2", "covered", "Sensitive client storage is an explicit browser/storage sink."),
  define("security.network.tls-verification-disabled", "pci-dss", "4.2.1", "covered", "Explicit certificate-verification disablement is directly observable."),
  define("security.network.insecure-http", "pci-dss", "4.2.1", "partially-covered", "Cleartext transport is detected, while deployment termination and network controls require verification."),
  define("security.network.tls-verification-disabled", "nist-ssdf", "PW.7.2", "partially-covered", "The implementation weakness is detectable, while the SSDF practice also includes process controls."),
  define("security.ssrf.untrusted-url", "owasp-top-10", "A10:2021", "covered", "Untrusted URL flow to network sinks is analyzed."),
  define("security.business.client-controlled-balance", "banking-policy", "BANK-LEDGER-AUTHORITY", "covered", "Client-controlled balance writes violate the authoritative-ledger policy."),
  define("security.business.client-controlled-fee", "banking-policy", "BANK-FEE-SERVER-CALC", "covered", "Transaction fees must be derived from trusted server-side policy."),
  define("security.business.transaction-idempotency", "banking-policy", "BANK-TXN-IDEMPOTENCY", "manual-verification-required", "Static analysis identifies missing visible idempotency evidence but cannot prove distributed deduplication behavior."),
  define("security.business.transaction-replay-risk", "banking-policy", "BANK-TXN-REPLAY", "manual-verification-required", "Replay protection may depend on infrastructure or event-processing state outside the analysis unit."),
  define("security.business.workflow-bypass", "banking-policy", "BANK-WORKFLOW-INTEGRITY", "partially-covered", "Visible privileged transitions are analyzed, while full workflow completeness needs manual verification."),
  define("security.react.sensitive-local-storage", "banking-policy", "BANK-BROWSER-NO-PERSISTENT-SECRETS", "covered", "Sensitive banking data in persistent browser storage is directly observable."),
  define("security.react.third-party-script", "pci-dss", "6.4.3", "partially-covered", "Third-party payment-page script presence is observable; authorization, integrity and inventory controls require additional evidence."),
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
