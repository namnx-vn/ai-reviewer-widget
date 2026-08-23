import { ReactEngine } from "../../react/engine";
import type { ReactPlugin } from "../../react/engine";
import type { AnalyzerContribution } from "./contracts";

export function createReactAnalyzerContribution(
  id: string,
  order: number,
  pluginsForFile: (path: string) => readonly ReactPlugin[],
): AnalyzerContribution {
  return {
    id,
    order,
    analyze(files) {
      const analyses = files
        .filter(({ path }) => /\.(tsx|jsx)$/.test(path))
        .flatMap((file) => {
          const plugins = pluginsForFile(file.path);
          return plugins.length === 0
            ? []
            : [new ReactEngine().analyzeWithWarnings({
                file: file.path,
                source: file.content,
                plugins,
              })];
        });

      return {
        findings: analyses.flatMap((analysis) => analysis.findings),
        warnings: analyses.flatMap((analysis) => analysis.warnings),
      };
    },
  };
}
