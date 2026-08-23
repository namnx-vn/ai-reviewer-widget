import type { ReviewFinding, ReviewWarning } from "../../domain/review";

export interface AnalyzerSourceFile {
  readonly path: string;
  readonly content: string;
}

export interface AnalyzerContributionResult {
  readonly findings: readonly ReviewFinding[];
  readonly warnings: readonly ReviewWarning[];
}

/** A deterministic analysis stage. Lower order values execute first. */
export interface AnalyzerContribution {
  readonly id: string;
  readonly order: number;
  analyze(files: readonly AnalyzerSourceFile[]): AnalyzerContributionResult;
}

export interface DeterministicAnalyzerAdapter {
  analyze(files: readonly AnalyzerSourceFile[]): AnalyzerContributionResult;
}
