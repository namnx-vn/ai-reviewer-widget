export type RuleExecutionScope =
  | "changed-range"
  | "changed-file"
  | "affected-module"
  | "repository";

export interface ChangedRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface AnalyzerFileChange {
  readonly path: string;
  readonly status: "added" | "modified" | "deleted" | "renamed";
  readonly previousPath?: string;
  readonly ranges?: readonly ChangedRange[];
}

export interface IncrementalAnalysisMetrics {
  readonly runtimeMs: number;
  readonly changedFileCount: number;
  readonly impactedFileCount: number;
}

export interface IncrementalAnalysisScope {
  readonly changedFiles: readonly string[];
  readonly changedRanges: Readonly<Record<string, readonly ChangedRange[]>>;
  readonly changedSymbols: readonly string[];
  readonly changedExports: readonly string[];
  readonly impactedFiles: readonly string[];
  readonly impactedPackages: readonly string[];
  readonly deletedFiles: readonly string[];
  readonly renamedFiles: readonly { readonly from: string; readonly to: string }[];
  readonly metrics: IncrementalAnalysisMetrics;
}
