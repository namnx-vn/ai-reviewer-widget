import type { ReviewFinding } from "../../domain/review";
import { parseSource } from "../ast/parser";
import { PerformanceAnalysisEngine } from "./engine/performance-analysis-engine";
import { createPerformanceRepositoryContext } from "./engine/repository-context";
import { analyzeInterproceduralPerformanceFiles } from "./interprocedural";
import type { PerformanceFinding, PerformanceRule } from "./model/types";
import { PerformanceRuleRegistry } from "./registry/performance-rule-registry";
import { assetPerformanceRules, asyncPerformanceRules, backpressurePerformanceRules, bankUiPerformanceRules, cachePerformanceRules, cpuPerformanceRules, databasePerformanceRules, importPerformanceRules, loadingPerformanceRules, memoryPerformanceRules, networkPerformanceRules, observabilityPerformanceRules, resiliencePerformanceRules, transactionPerformanceRules } from "./rules";

const DEFAULT_RULES: readonly PerformanceRule[] = [...importPerformanceRules, ...loadingPerformanceRules, ...networkPerformanceRules, ...asyncPerformanceRules, ...memoryPerformanceRules, ...assetPerformanceRules, ...cpuPerformanceRules, ...databasePerformanceRules, ...cachePerformanceRules, ...resiliencePerformanceRules, ...backpressurePerformanceRules, ...transactionPerformanceRules, ...observabilityPerformanceRules, ...bankUiPerformanceRules];

export interface PerformanceSourceFile {
  readonly path: string;
  readonly content: string;
}

export function analyzePerformanceFindings(
  file: string,
  source: string,
): readonly ReviewFinding[] {
  return analyzePerformanceFiles([{ path: file, content: source }]);
}

export function analyzePerformanceFiles(
  files: readonly PerformanceSourceFile[],
): readonly ReviewFinding[] {
  const registry = createDefaultRegistry();
  const sourceFiles = files.filter((file) => isSourceFile(file.path));
  const baseRepository = createPerformanceRepositoryContext(files);
  const repository = {
    ...baseRepository,
    interprocedural: analyzeInterproceduralPerformanceFiles(sourceFiles),
  };
  const engine = new PerformanceAnalysisEngine();

  return sourceFiles
    .flatMap((file) => {
      try {
        return engine.analyze({
          file: file.path,
          source: file.content,
          ast: parseSource(file.content),
          repository,
        }, registry).map(toReviewFinding);
      } catch {
        return [];
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function createDefaultRegistry(): PerformanceRuleRegistry {
  const registry = new PerformanceRuleRegistry();
  DEFAULT_RULES.forEach((rule) => registry.register(rule));
  return registry;
}

function toReviewFinding(finding: PerformanceFinding): ReviewFinding {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    title: finding.title,
    message: finding.message,
    severity: finding.severity,
    source: "performance",
    location: {
      file: finding.location.path,
      line: finding.location.line,
      column: finding.location.column,
    },
    suggestion: finding.suggestion,
    confidence: confidenceScore(finding.confidence),
  };
}

function confidenceScore(confidence: PerformanceFinding["confidence"]): number {
  return confidence === "high" ? 1 : confidence === "medium" ? 0.75 : 0.5;
}

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path);
}
