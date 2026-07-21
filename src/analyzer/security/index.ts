export { createSecurityFindingId } from "./engine/finding-id";
export { SecurityAnalysisEngine } from "./engine/security-analysis-engine";
export { analyzeIntraproceduralTaint } from "./flow";
export { SecurityRuleRegistry } from "./registry/security-rule-registry";
export { analyzeSupplyChain } from "./supply-chain";
export { dangerousExecutionRules } from "./rules/dangerous-execution";
export { authenticationRules } from "./rules/auth";
export { browserSecurityRules } from "./rules/browser";
export { createCryptoRules, cryptoRules } from "./rules/crypto";
export { injectionRules } from "./rules/injection";
export { networkTransportRules } from "./rules/network";
export { secretsRules } from "./rules/secrets";
export { sessionTokenRules } from "./rules/session";
export {
  DEFAULT_CRYPTO_POLICY,
  isEcbMode,
  isWeakCipher,
  isWeakHash,
  normalizeCryptoAlgorithm,
  type CryptoPolicy,
} from "./policies/crypto-policy";
export type {
  TaintFlowAdapter,
  TaintFlowMatch,
  TaintKind,
  TaintSanitizer,
  TaintSink,
  TaintSource,
  TaintState,
  TaintStep,
} from "./flow";
export type {
  SecurityCategory,
  SecurityConfidence,
  SecurityEvidence,
  SecurityFinding,
  SecurityFindingIdInput,
  SecurityFlowStep,
  SecurityLocation,
  SecurityPolicy,
  SecurityRange,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
  SecuritySanitizerKind,
  SecuritySeverity,
  SecuritySinkKind,
  SecuritySourceKind,
  SecurityStandard,
  SecurityStandardMapping,
} from "./model/types";
export type {
  SupplyChainLockfile,
  SupplyChainManifest,
  SupplyChainRepository,
  SupplyChainSourceFile,
} from "./supply-chain";
