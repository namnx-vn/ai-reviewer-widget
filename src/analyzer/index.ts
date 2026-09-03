import type { ReviewFinding, ReviewWarning } from "../domain/review";
import type { ASTRule } from "./ast/rules";
import {
  createDeterministicAnalyzerAdapter,
  type AnalyzerSourceFile,
} from "./composition";

export { analyzeFile } from "./file-analysis";
export * from "./composition";
export * from "./repository-context";

export function analyzeFiles(
  files: readonly AnalyzerSourceFile[],
  astRules: readonly ASTRule[] = [],
): ReviewFinding[] {
  return [...analyzeFilesWithWarnings(files, astRules).findings];
}

export interface AnalyzerReviewResult {
  readonly findings: readonly ReviewFinding[];
  readonly warnings: readonly ReviewWarning[];
}

export function analyzeFilesWithWarnings(
  files: readonly AnalyzerSourceFile[],
  astRules: readonly ASTRule[] = [],
): AnalyzerReviewResult {
  return createDeterministicAnalyzerAdapter({ astRules }).analyze(files);
}
