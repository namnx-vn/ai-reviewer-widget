import { analyzeAST } from "./ast/analyzer";
import { analyzeArchitecture, analyzeArchitectureGraph, buildDependencyGraph } from "./architecture/analyzer";
import { noConsoleRule } from "./ast/rules/no-console";
import { noEvalRule } from "./ast/rules/no-eval";
import type { ASTRule } from "./ast/rules";
import { noRemoteToRemoteImport } from "./architecture/rules";
import type { ReviewFinding } from "../review/types";
import type { ReviewWarning } from "../review/types";
import { analyzeMicroFrontends } from "../mfe";
import { analyzeSecurityFindings, analyzeSupplyChainFindings } from "./security/review-findings";
import { analyzeSecurityFindingsWithWarnings } from "./security/review-findings";
import { analyzePerformanceFindings } from "./performance/review-findings";

export function analyzeFile(
  file: string,
  source: string,
  astRules: readonly ASTRule[] = [],
): ReviewFinding[] {
  if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file)) {
    return [];
  }

  return [
    ...analyzeAST(
      source,
      file,
      [
        noConsoleRule,
        noEvalRule,
        ...astRules,
      ],
    ),

    ...analyzeArchitecture(
      file,
      source,
      [
        noRemoteToRemoteImport,
      ],
    ),
    ...analyzeSecurityFindings(file, source),
    ...analyzePerformanceFindings(file, source),
  ];
}

export function analyzeFiles(
  files: readonly { path: string; content: string }[],
  astRules: readonly ASTRule[] = [],
): ReviewFinding[] {
  return analyzeFilesWithWarnings(files, astRules).findings;
}

export interface AnalyzerReviewResult {
  readonly findings: ReviewFinding[];
  readonly warnings: ReviewWarning[];
}

export function analyzeFilesWithWarnings(
  files: readonly { path: string; content: string }[],
  astRules: readonly ASTRule[] = [],
): AnalyzerReviewResult {
  const astFindings = files.flatMap(({ path, content }) =>
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path)
      ? analyzeAST(content, path, [noConsoleRule, noEvalRule, ...astRules])
      : [],
  );
  const securityAnalyses = files
    .filter(({ path }) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path))
    .map(({ path, content }) => analyzeSecurityFindingsWithWarnings(path, content));
  const performanceFindings = files.flatMap(({ path, content }) =>
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path)
      ? analyzePerformanceFindings(path, content)
      : [],
  );
  return {
    findings: [
      ...astFindings,
      ...securityAnalyses.flatMap((analysis) => analysis.findings),
      ...performanceFindings,
      ...analyzeArchitectureGraph(buildDependencyGraph(files), [noRemoteToRemoteImport]),
      ...analyzeMicroFrontends(files).findings,
      ...analyzeSupplyChainFindings(files),
    ],
    warnings: securityAnalyses.flatMap((analysis) => analysis.warnings),
  };
}
