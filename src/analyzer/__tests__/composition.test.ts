import { describe, expect, it } from "vitest";

import {
  AnalyzerContributionRegistry,
  createReactAnalyzerContribution,
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

  it("selects families and rule IDs and applies severity at the composition boundary", () => {
    const registry = AnalyzerContributionRegistry.empty()
      .register(contribution("core.quality", 10, "quality.first"))
      .register(contribution("core.security", 20, "security.second"));

    const result = runAnalyzerContributions([], registry, {
      disabledContributionIds: ["core.quality"],
      disabledRuleIds: [],
      severityOverrides: { "security.second": "critical" },
    });

    expect(result.findings).toEqual([
      expect.objectContaining({ ruleId: "security.second", severity: "critical" }),
    ]);
  });

  it("resolves React framework context per nearest package boundary", () => {
    const reactContribution = createReactAnalyzerContribution(
      "test.react-context",
      10,
      () => [{
        id: "test.react-context-plugin",
        name: "React context test plugin",
        version: "1.0.0",
        rules: [{
          id: "test.next-context",
          description: "Emits only for Next.js packages.",
          check(node, context) {
            if (node.type !== "Program" || context.framework?.nextjs === undefined) {
              return [];
            }

            return [{
              id: `test.next-context:${context.file}`,
              ruleId: "test.next-context",
              title: "Next.js context",
              message: "Next.js context is package-local.",
              severity: "info",
              source: "ast",
              confidence: 1,
              location: { file: context.file, line: 1 },
            }];
          },
        }],
      }],
    );
    const result = reactContribution.analyze([
      {
        path: "packages/dashboard/package.json",
        content: JSON.stringify({ dependencies: { next: "16.0.0", react: "19.2.0" } }),
      },
      { path: "packages/dashboard/src/app/page.tsx", content: "export default function Page() { return null; }" },
      {
        path: "packages/widget/package.json",
        content: JSON.stringify({ dependencies: { react: "18.3.1" } }),
      },
      { path: "packages/widget/src/app/view.tsx", content: "export function View() { return null; }" },
    ]);

    expect(result.findings.map((finding) => finding.location?.file)).toEqual([
      "packages/dashboard/src/app/page.tsx",
    ]);
  });
});
