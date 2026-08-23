import type { ASTRule } from "../ast/rules";
import { createBuiltInAnalyzerContributions } from "./built-ins";
import type {
  AnalyzerContribution,
  DeterministicAnalyzerAdapter,
} from "./contracts";
import { AnalyzerContributionRegistry } from "./registry";
import { runAnalyzerContributions } from "./runner";
import { prepareAnalyzerFiles } from "./source-files";

export interface DeterministicAnalyzerAdapterOptions {
  readonly astRules?: readonly ASTRule[];
  readonly contributions?: readonly AnalyzerContribution[];
}

export function createDeterministicAnalyzerAdapter(
  options: DeterministicAnalyzerAdapterOptions = {},
): DeterministicAnalyzerAdapter {
  const registry = AnalyzerContributionRegistry.empty().registerAll([
    ...createBuiltInAnalyzerContributions(options.astRules),
    ...(options.contributions ?? []),
  ]);

  return {
    analyze(files) {
      const prepared = prepareAnalyzerFiles(files);
      const analysis = runAnalyzerContributions(prepared.files, registry);
      return {
        findings: analysis.findings,
        warnings: [...prepared.warnings, ...analysis.warnings],
      };
    },
  };
}
