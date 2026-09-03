import type { ReviewFinding, ReviewWarning, Severity } from "../../domain/review";
import type { IncrementalAnalysisScope, RuleExecutionScope } from "../incremental";
import type { RepositoryContext } from "../repository-context";

export interface AnalyzerSourceFile {
  readonly path: string;
  readonly content: string;
  readonly changedLines?: readonly number[];
}

export interface AnalyzerContributionResult {
  readonly findings: readonly ReviewFinding[];
  readonly warnings: readonly ReviewWarning[];
}

/** A deterministic analysis stage. Lower order values execute first. */
export interface AnalyzerContribution {
  readonly id: string;
  readonly order: number;
  /** Safe default is repository-wide execution when omitted. */
  readonly executionScope?: RuleExecutionScope;
  analyze(
    files: readonly AnalyzerSourceFile[],
    repositoryContext?: RepositoryContext,
  ): AnalyzerContributionResult;
}

export interface DeterministicAnalyzerAdapter {
  analyze(
    files: readonly AnalyzerSourceFile[],
    selection?: AnalyzerSelection,
    incrementalScope?: IncrementalAnalysisScope,
  ): AnalyzerContributionResult;
}

export interface AnalyzerSelection {
  readonly disabledContributionIds: readonly string[];
  readonly disabledRuleIds: readonly string[];
  readonly severityOverrides: Readonly<Record<string, Severity>>;
}
