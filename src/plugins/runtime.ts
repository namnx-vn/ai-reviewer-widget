import { analyzeFilesWithWarnings } from "../analyzer";
import { ReactEngine } from "../react/engine";
import type { ReviewFinding, ReviewWarning } from "../review/types";
import type { PluginRegistry } from "./registry";
import type { PluginSourceFile } from "./types";

export interface PluginAnalysisResult {
  readonly findings: ReviewFinding[];
  readonly warnings: ReviewWarning[];
}

export function analyzeWithPlugins(
  files: readonly PluginSourceFile[],
  registry: PluginRegistry,
): PluginAnalysisResult {
  const snapshot = registry.snapshot();
  const coreAnalysis = analyzeFilesWithWarnings(files, snapshot.astRules);
  const contributedAnalyses = snapshot.analyzers.map((analyzer) =>
    analyzer.analyze(files));
  const reactAnalyses = snapshot.reactPlugins.length === 0
    ? []
    : files
      .filter((file) => /\.(tsx|jsx)$/.test(file.path))
      .map((file) => new ReactEngine().analyzeWithWarnings({
        file: file.path,
        source: file.content,
        plugins: snapshot.reactPlugins,
      }));

  return {
    findings: [
      ...coreAnalysis.findings,
      ...contributedAnalyses.flatMap((analysis) => analysis.findings),
      ...reactAnalyses.flatMap((analysis) => analysis.findings),
    ],
    warnings: [
      ...coreAnalysis.warnings,
      ...contributedAnalyses.flatMap((analysis) => analysis.warnings ?? []),
      ...reactAnalyses.flatMap((analysis) => analysis.warnings),
    ],
  };
}
