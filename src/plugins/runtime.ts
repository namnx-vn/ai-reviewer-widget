import {
  BUILT_IN_ANALYZER_ORDER,
  createDeterministicAnalyzerAdapter,
  createReactAnalyzerContribution,
  type AnalyzerContribution,
} from "../analyzer";
import type { ReviewFinding, ReviewWarning } from "../domain/review";
import type { PluginRegistry } from "./registry";
import type { PluginRegistrySnapshot, PluginSourceFile } from "./types";

export interface PluginAnalysisResult {
  readonly findings: ReviewFinding[];
  readonly warnings: ReviewWarning[];
}

export function analyzeWithPlugins(
  files: readonly PluginSourceFile[],
  registry: PluginRegistry,
): PluginAnalysisResult {
  const snapshot = registry.snapshot();
  const contributions = createPluginAnalyzerContributions(snapshot);
  const analysis = createDeterministicAnalyzerAdapter({
    astRules: snapshot.astRules,
    contributions,
  }).analyze(files);

  return {
    findings: [...analysis.findings],
    warnings: [...analysis.warnings],
  };
}

export function createPluginAnalyzerContributions(
  snapshot: PluginRegistrySnapshot,
): readonly AnalyzerContribution[] {
  const contributions: AnalyzerContribution[] = snapshot.analyzers.map(
    (analyzer) => ({
      id: analyzer.id,
      order: BUILT_IN_ANALYZER_ORDER.pluginAnalyzer,
      analyze(sourceFiles) {
        const analysis = analyzer.analyze(sourceFiles);
        return {
          findings: analysis.findings,
          warnings: analysis.warnings ?? [],
        };
      },
    }),
  );
  if (snapshot.reactPlugins.length > 0) {
    contributions.push(createReactAnalyzerContribution(
      "plugin.react",
      BUILT_IN_ANALYZER_ORDER.pluginReact,
      () => snapshot.reactPlugins,
    ));
  }
  return contributions;
}
