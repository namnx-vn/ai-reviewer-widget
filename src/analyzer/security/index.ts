export { createSecurityFindingId } from "./engine/finding-id";
export { SecurityAnalysisEngine } from "./engine/security-analysis-engine";
export { analyzeIntraproceduralTaint } from "./flow";
export { SecurityRuleRegistry } from "./registry/security-rule-registry";
export { dangerousExecutionRules } from "./rules/dangerous-execution";
export { injectionRules } from "./rules/injection";
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
