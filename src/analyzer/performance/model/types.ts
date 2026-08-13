import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { DependencyGraph } from "../../architecture/types";

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
export interface PerformanceFunctionSummary {
  readonly name: string;
  readonly file?: string;
  readonly exported?: boolean;
  readonly directCostKinds: readonly PerformanceCostKind[];
  readonly costKinds: readonly PerformanceCostKind[];
  readonly calls: readonly string[];
  readonly unknownCalls: readonly string[];
  readonly parameterEffects?: readonly PerformanceParameterEffect[];
  readonly returnsCostKinds?: readonly PerformanceCostKind[];
}
export interface PerformanceParameterEffect { readonly parameterIndex: number; readonly effect: "iteration-size" | "callback-repeated" | "request-input" | "query-input"; }
export interface PerformanceInterproceduralResult { readonly summaries: readonly PerformanceFunctionSummary[]; readonly callGraph: ReadonlyMap<string, readonly string[]>; }
export interface PerformanceFinding { readonly id: string; readonly ruleId: string; readonly title: string; readonly message: string; readonly severity: PerformanceSeverity; readonly confidence: PerformanceConfidence; readonly category: PerformanceCategory; readonly location: PerformanceLocation; readonly evidence: readonly PerformanceEvidence[]; readonly operations?: readonly PerformanceOperation[]; readonly suggestion?: string; }
export interface PerformanceRuleMeta { readonly id: string; readonly title: string; readonly description: string; readonly category: PerformanceCategory; readonly defaultSeverity: PerformanceSeverity; readonly defaultConfidence: PerformanceConfidence; }
export interface PerformanceDatabaseAdapter { readonly callPaths: readonly string[]; readonly collectionMethods?: readonly string[]; readonly transactionMethods?: readonly string[]; }
export interface PerformanceRepositoryContext {
  readonly dependencyGraph: DependencyGraph;
  readonly dependencyVersions: ReadonlyMap<string, readonly string[]>;
  readonly interprocedural?: PerformanceInterproceduralResult;
}
export interface PerformanceRuleContext {
  readonly source: string;
  readonly file: string;
  readonly ast: TSESTree.Program;
  readonly repository?: PerformanceRepositoryContext;
  readonly operations?: readonly PerformanceOperation[];
  readonly databaseAdapters?: readonly PerformanceDatabaseAdapter[];
  readonly criticalEntrypoints?: readonly string[];
  readonly criticalUiComponents?: readonly string[];
  readonly telemetryCallPaths?: readonly string[];
  readonly settings?: Readonly<Record<string, unknown>>;
}
export interface PerformanceRule { readonly meta: PerformanceRuleMeta; check(context: PerformanceRuleContext): readonly PerformanceFinding[]; }
export interface PerformanceProfile { readonly id: string; readonly extends?: string; readonly enabledRuleIds?: readonly string[]; readonly disabledRuleIds?: readonly string[]; readonly severityOverrides?: Readonly<Record<string, PerformanceSeverity>>; readonly minimumConfidence?: PerformanceConfidence; readonly criticalEntrypoints?: readonly string[]; }
export interface PerformanceFindingIdInput { readonly ruleId: string; readonly path: string; readonly range?: PerformanceRange; readonly operationKind?: PerformanceCostKind; }
