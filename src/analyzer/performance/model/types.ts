import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type PerformanceSeverity = "critical" | "high" | "medium" | "low" | "info";
export type PerformanceConfidence = "high" | "medium" | "low";
export type PerformanceCategory = "bundle" | "rendering" | "loading" | "assets" | "network" | "async" | "memory" | "resource" | "cpu" | "database" | "cache" | "resilience" | "backpressure" | "rate-control" | "transaction" | "observability" | "bank-ui";
export type PerformanceCostKind = "network" | "filesystem" | "database" | "serialization" | "cpu-heavy" | "allocation" | "render" | "external-service";

export interface PerformanceRange { readonly start: number; readonly end: number; }
export interface PerformanceLocation { readonly path: string; readonly line?: number; readonly column?: number; readonly range?: PerformanceRange; }
export interface PerformanceEvidence { readonly message: string; readonly location?: PerformanceLocation; readonly operationKind?: PerformanceCostKind; }
export interface PerformanceOperation { readonly kind: PerformanceCostKind; readonly kinds?: readonly PerformanceCostKind[]; readonly location: PerformanceLocation; readonly repeated?: boolean; readonly bounded?: boolean; readonly blocking?: boolean; readonly external?: boolean; }
export interface PerformancePathStep { readonly label: string; readonly operation?: PerformanceOperation; readonly location?: PerformanceLocation; }
export interface PerformanceCostSummary { readonly operations: readonly PerformanceOperation[]; readonly paths: readonly PerformancePathStep[]; }
export interface PerformanceFinding { readonly id: string; readonly ruleId: string; readonly title: string; readonly message: string; readonly severity: PerformanceSeverity; readonly confidence: PerformanceConfidence; readonly category: PerformanceCategory; readonly location: PerformanceLocation; readonly evidence: readonly PerformanceEvidence[]; readonly operations?: readonly PerformanceOperation[]; readonly suggestion?: string; }
export interface PerformanceRuleMeta { readonly id: string; readonly title: string; readonly description: string; readonly category: PerformanceCategory; readonly defaultSeverity: PerformanceSeverity; readonly defaultConfidence: PerformanceConfidence; }
export interface PerformanceDatabaseAdapter { readonly callPaths: readonly string[]; readonly collectionMethods?: readonly string[]; }
export interface PerformanceRuleContext { readonly source: string; readonly file: string; readonly ast: TSESTree.Program; readonly operations?: readonly PerformanceOperation[]; readonly databaseAdapters?: readonly PerformanceDatabaseAdapter[]; readonly settings?: Readonly<Record<string, unknown>>; }
export interface PerformanceRule { readonly meta: PerformanceRuleMeta; check(context: PerformanceRuleContext): readonly PerformanceFinding[]; }
export interface PerformanceProfile { readonly id: string; readonly extends?: string; readonly enabledRuleIds?: readonly string[]; readonly disabledRuleIds?: readonly string[]; readonly severityOverrides?: Readonly<Record<string, PerformanceSeverity>>; readonly minimumConfidence?: PerformanceConfidence; readonly criticalEntrypoints?: readonly string[]; }
export interface PerformanceFindingIdInput { readonly ruleId: string; readonly path: string; readonly range?: PerformanceRange; readonly operationKind?: PerformanceCostKind; }
