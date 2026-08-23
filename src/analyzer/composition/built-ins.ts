import { analyzeMicroFrontends } from "../../mfe";
import type { ReviewFinding } from "../../domain/review";
import { analyzeArchitectureGraph, buildDependencyGraph } from "../architecture/analyzer";
import { noRemoteToRemoteImport } from "../architecture/rules";
import { analyzeAST } from "../ast/analyzer";
import { noConsoleRule } from "../ast/rules/no-console";
import { noEvalRule } from "../ast/rules/no-eval";
import type { ASTRule } from "../ast/rules";
import { analyzePerformanceFiles } from "../performance/review-findings";
import {
  analyzeSecurityFindingsWithWarnings,
  analyzeSupplyChainFindings,
} from "../security/review-findings";
import type { AnalyzerContribution } from "./contracts";
import { isSourceFile } from "./source-files";

export const BUILT_IN_ANALYZER_ORDER = Object.freeze({
  ast: 100,
  security: 200,
  performance: 300,
  architecture: 400,
  microFrontend: 500,
  supplyChain: 600,
  react: 700,
  pluginAnalyzer: 800,
  pluginReact: 900,
});

export function createBuiltInAnalyzerContributions(
  astRules: readonly ASTRule[] = [],
): readonly AnalyzerContribution[] {
  return [
    {
      id: "core.ast",
      order: BUILT_IN_ANALYZER_ORDER.ast,
      analyze(files) {
        return result(sourceFiles(files).flatMap(({ path, content }) =>
          analyzeAST(content, path, [noConsoleRule, noEvalRule, ...astRules])));
      },
    },
    {
      id: "core.security",
      order: BUILT_IN_ANALYZER_ORDER.security,
      analyze(files) {
        const analyses = sourceFiles(files).map(({ path, content }) =>
          analyzeSecurityFindingsWithWarnings(path, content));
        return {
          findings: analyses.flatMap((analysis) => analysis.findings),
          warnings: analyses.flatMap((analysis) => analysis.warnings),
        };
      },
    },
    {
      id: "core.performance",
      order: BUILT_IN_ANALYZER_ORDER.performance,
      analyze: (files) => result(analyzePerformanceFiles(files)),
    },
    {
      id: "core.architecture",
      order: BUILT_IN_ANALYZER_ORDER.architecture,
      analyze(files) {
        return result(analyzeArchitectureGraph(
          buildDependencyGraph(sourceFiles(files)),
          [noRemoteToRemoteImport],
        ));
      },
    },
    {
      id: "core.micro-frontend",
      order: BUILT_IN_ANALYZER_ORDER.microFrontend,
      analyze: (files) => result(analyzeMicroFrontends(sourceFiles(files)).findings),
    },
    {
      id: "core.supply-chain",
      order: BUILT_IN_ANALYZER_ORDER.supplyChain,
      analyze: (files) => result(analyzeSupplyChainFindings(files)),
    },
  ];
}

function sourceFiles<T extends { readonly path: string }>(files: readonly T[]): readonly T[] {
  return files.filter(({ path }) => isSourceFile(path));
}

function result(findings: readonly ReviewFinding[]): {
  readonly findings: readonly ReviewFinding[];
  readonly warnings: readonly [];
} {
  return { findings, warnings: [] };
}
