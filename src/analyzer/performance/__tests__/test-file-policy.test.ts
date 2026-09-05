import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import {
  asyncPerformanceRules,
  memoryPerformanceRules,
  PerformanceAnalysisEngine,
  PerformanceRuleRegistry,
} from "..";

const source = `
export function schedule(callback: () => void) {
  setTimeout(callback, 0);
}

export async function runAll(items: readonly string[]) {
  return Promise.all(items.map(async (item) => fetch(item)));
}
`;

function analyze(file: string): readonly string[] {
  const registry = new PerformanceRuleRegistry();
  for (const rule of [...asyncPerformanceRules, ...memoryPerformanceRules]) {
    registry.register(rule);
  }

  return new PerformanceAnalysisEngine()
    .analyze({ source, file, ast: parseSource(source) }, registry)
    .map(({ ruleId }) => ruleId);
}

describe("performance test-file policy", () => {
  it("suppresses runtime lifecycle heuristics in tests without disabling other performance rules", () => {
    const productionRuleIds = analyze("src/scheduler.ts");
    expect(productionRuleIds).toContain("performance.async.fire-and-forget-resource-work");
    expect(productionRuleIds).toContain("performance.memory.timer-leak");
    expect(productionRuleIds).toContain("performance.async.unbounded-promise-all");

    const testRuleIds = analyze("src/__tests__/scheduler.test.ts");
    expect(testRuleIds).not.toContain("performance.async.fire-and-forget-resource-work");
    expect(testRuleIds).not.toContain("performance.memory.timer-leak");
    expect(testRuleIds).toContain("performance.async.unbounded-promise-all");
  });
});
