import type { PerformanceConfidence, PerformanceFinding, PerformanceSeverity } from "../model/types";
import type { PerformanceProfileId, ResolvedPerformanceProfile } from "../policies";
export type PerformanceQualityGateDecision = "pass" | "warn" | "fail";
export type PerformanceQualityGateState = "new" | "baseline" | "suppressed" | "ignored";
export interface PerformanceQualityGateSuppression { readonly findingId?: string; readonly ruleId?: string; readonly reason: string; readonly expiresAt?: string; }
export interface PerformanceQualityGateInput { readonly findings: readonly PerformanceFinding[]; readonly profile: PerformanceProfileId | ResolvedPerformanceProfile; readonly evaluatedAt: string; readonly baselineFindingIds?: readonly string[]; readonly suppressions?: readonly PerformanceQualityGateSuppression[]; readonly failOnSeverities?: readonly PerformanceSeverity[]; }
export interface PerformanceQualityGateFindingResult { readonly findingId: string; readonly ruleId: string; readonly state: PerformanceQualityGateState; readonly effectiveSeverity: PerformanceSeverity; readonly confidence: PerformanceConfidence; readonly reason: string; }
export interface PerformanceQualityGateResult { readonly decision: PerformanceQualityGateDecision; readonly profileId: string; readonly findings: readonly PerformanceQualityGateFindingResult[]; readonly reasons: readonly string[]; }
