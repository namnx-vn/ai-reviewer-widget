import type { ASTRule } from "../ast/rules";
import { buildRepositoryContext } from "../repository-context";
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
    analyze(files, selection, incrementalScope) {
      const prepared = prepareAnalyzerFiles(files);
      const repositoryContext = buildRepositoryContext(prepared.files);
      const analysis = runAnalyzerContributions(
        prepared.files,
        registry,
        selection,
        repositoryContext,
        incrementalScope,
      );
      return {
        findings: analysis.findings,
        warnings: [...prepared.warnings, ...analysis.warnings],
      };
    },
  };
}
