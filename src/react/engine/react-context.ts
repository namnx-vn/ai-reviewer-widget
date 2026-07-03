import type { ReactPlugin } from "./react-plugin";
import type { ReactRule } from "./react-rule";

export interface ReactAnalysisContext {
  readonly source: string;
  readonly file: string;
  readonly rules: readonly ReactRule[];
}

export function createReactAnalysisContext(
  source: string,
  file: string,
  plugins: readonly ReactPlugin[],
): ReactAnalysisContext {
  const rules = plugins.flatMap(
    (plugin) => plugin.rules,
  );

  return {
    source,
    file,
    rules,
  };
}