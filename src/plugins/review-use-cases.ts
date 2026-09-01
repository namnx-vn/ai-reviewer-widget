import {
  createDefaultReviewUseCases,
  type ReviewConfiguration,
  type ReviewUseCases,
} from "../application/review";
import type { PluginRegistry } from "./registry";
import { createPluginAnalyzerContributions } from "./runtime";
import { createDefaultRuleCatalog } from "../analyzer";
import type { RuleCatalog } from "../config";

/** Builds the shared application pipeline with all deterministic plugin contributions. */
export function createPluginReviewUseCases(
  registry: PluginRegistry,
  configuration?: ReviewConfiguration,
): ReviewUseCases {
  const snapshot = registry.snapshot();
  const useCases = createDefaultReviewUseCases({
    astRules: snapshot.astRules,
    analyzerContributions: createPluginAnalyzerContributions(snapshot),
    configuration,
  });
  const providerName = configuration?.ai.provider;
  if (providerName === undefined) return useCases;
  const provider = snapshot.aiProviders.find(({ name }) => name === providerName);
  if (provider === undefined) throw new Error(`Configured AI provider "${providerName}" is not registered.`);

  return {
    reviewFiles: useCases.reviewFiles,
    reviewPullRequest: (input, reviewer) => useCases.reviewPullRequest(input, reviewer ?? provider),
  };
}

/** Catalog used by config adapters once plugin IDs are known at composition time. */
export function createPluginRuleCatalog(registry: PluginRegistry): RuleCatalog {
  const snapshot = registry.snapshot();
  return createDefaultRuleCatalog(
    snapshot.astRules,
    [
      ...snapshot.reactPlugins.flatMap((plugin) => plugin.rules.map((rule) => rule.id)),
      ...snapshot.analyzers.map((analyzer) => analyzer.id),
    ],
  );
}
