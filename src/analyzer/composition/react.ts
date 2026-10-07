import { ReactEngine } from "../../react/engine";
import type { ReactPlugin } from "../../react/engine";
import {
  resolveFrameworkContext,
  type FrameworkContext,
} from "../../react/semantic";
import type { AnalyzerContribution } from "./contracts";

export function createReactAnalyzerContribution(
  id: string,
  order: number,
  pluginsForFile: (
    path: string,
    framework?: FrameworkContext,
  ) => readonly ReactPlugin[],
): AnalyzerContribution {
  return {
    id,
    order,
    analyze(files) {
      const contextFiles = files.map(({ path, content }) => ({ path, content }));
      const analyses = files
        .flatMap((file) => {
          if (!/\.[cm]?[jt]sx?$/.test(file.path)) {
            return [];
          }

          const framework = resolveFrameworkContext({
            files: contextFiles,
            targetFile: file.path,
          });
          const plugins = pluginsForFile(file.path, framework);
          const isReactSource = /\.(?:jsx|tsx)$/.test(file.path);
          const isNextModule = plugins.some((plugin) => plugin.id === "nextjs");

          return plugins.length === 0 || (!isReactSource && !isNextModule)
            ? []
            : [new ReactEngine().analyzeWithWarnings({
                file: file.path,
                source: file.content,
                plugins,
                framework,
              })];
        });

      return {
        findings: analyses.flatMap((analysis) => analysis.findings),
        warnings: analyses.flatMap((analysis) => analysis.warnings),
      };
    },
  };
}
