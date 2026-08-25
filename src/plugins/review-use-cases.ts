import { createDefaultReviewUseCases, type ReviewUseCases } from "../application/review";
import type { PluginRegistry } from "./registry";
import { createPluginAnalyzerContributions } from "./runtime";

/** Builds the shared application pipeline with all deterministic plugin contributions. */
export function createPluginReviewUseCases(registry: PluginRegistry): ReviewUseCases {
  const snapshot = registry.snapshot();
  return createDefaultReviewUseCases({
    astRules: snapshot.astRules,
    analyzerContributions: createPluginAnalyzerContributions(snapshot),
  });
}
