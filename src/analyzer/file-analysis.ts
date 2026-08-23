import type { ReviewFinding } from "../domain/review";
import { analyzeArchitecture } from "./architecture/analyzer";
import { noRemoteToRemoteImport } from "./architecture/rules";
import { analyzeAST } from "./ast/analyzer";
import type { ASTRule } from "./ast/rules";
import { noConsoleRule } from "./ast/rules/no-console";
import { noEvalRule } from "./ast/rules/no-eval";
import { isSourceFile } from "./composition";
import { analyzePerformanceFindings } from "./performance/review-findings";
import { analyzeSecurityFindings } from "./security/review-findings";

/** Compatibility entry point for callers that analyze one source file. */
export function analyzeFile(
  file: string,
  source: string,
  astRules: readonly ASTRule[] = [],
): ReviewFinding[] {
  if (!isSourceFile(file)) return [];

  return [
    ...analyzeAST(source, file, [noConsoleRule, noEvalRule, ...astRules]),
    ...analyzeArchitecture(file, source, [noRemoteToRemoteImport]),
    ...analyzeSecurityFindings(file, source),
    ...analyzePerformanceFindings(file, source),
  ];
}
