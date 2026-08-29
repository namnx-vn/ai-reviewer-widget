import { describe, expect, it } from "vitest";

import {
  AnalyzerContributionRegistry,
  runAnalyzerContributions,
  type AnalyzerContribution,
} from "../composition";

function contribution(
  id: string,
  order: number,
  ruleId = id,
): AnalyzerContribution {
  return {
    id,
    order,
    analyze() {
      return {
        findings: [{
          id,
          ruleId,
          title: id,
          message: id,
          severity: "info",
          source: "architecture",
          confidence: 1,
        }],
        warnings: [],
      };
    },
  };
}

describe("deterministic analyzer composition", () => {
  it("returns a new registry and executes explicit order stably", () => {
    const empty = AnalyzerContributionRegistry.empty();
    const registry = empty
      .register(contribution("last", 20))
      .register(contribution("first", 10))
      .register(contribution("same-order", 20));

    expect(empty.snapshot()).toEqual([]);
    expect(registry.snapshot().map(({ id }) => id)).toEqual([
      "first",
      "last",
      "same-order",
    ]);
    expect(runAnalyzerContributions([], registry).findings.map(({ ruleId }) => ruleId))
      .toEqual(["first", "last", "same-order"]);
  });

  it("rejects duplicate contribution ids before analysis", () => {
    const registry = AnalyzerContributionRegistry.empty()
      .register(contribution("duplicate", 10));

    expect(() => registry.register(contribution("duplicate", 20))).toThrow(
      'Analyzer contribution "duplicate" is already registered.',
    );
  });

  it("isolates a failed contribution and keeps successful findings", () => {
    const failed: AnalyzerContribution = {
      id: "plugin.failed",
      order: 20,
      analyze() {
        throw new Error("secret failure detail");
      },
    };
    const registry = AnalyzerContributionRegistry.empty()
      .register(contribution("core.success", 10))
      .register(failed)
      .register(contribution("plugin.success", 30));

    const result = runAnalyzerContributions([], registry);

    expect(result.findings.map(({ ruleId }) => ruleId)).toEqual([
      "core.success",
      "plugin.success",
    ]);
    expect(result.warnings).toEqual([{
      code: "ANALYZER_CONTRIBUTION_FAILED",
      message: 'Analyzer contribution "plugin.failed" failed.',
    }]);
    expect(result.warnings[0]?.message).not.toContain("secret failure detail");
  });
});
