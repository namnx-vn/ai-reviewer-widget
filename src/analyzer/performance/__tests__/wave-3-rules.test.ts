import { describe, expect, it } from "vitest";
import { parseSource } from "../../ast/parser";
import { asyncPerformanceRules, loadingPerformanceRules, memoryPerformanceRules, PerformanceAnalysisEngine, PerformanceRuleRegistry } from "..";

function ruleIds(source: string, rules: readonly (typeof asyncPerformanceRules)[number][]): readonly string[] { const registry = new PerformanceRuleRegistry(); rules.forEach((rule) => registry.register(rule)); return new PerformanceAnalysisEngine().analyze({ file: "feature.ts", source, ast: parseSource(source) }, registry).map((finding) => finding.ruleId); }
describe("wave 3 performance rules", () => {
  it("finds eager routes and dynamic imports in loops", () => expect(ruleIds('import Page from "./routes/payments"; for (const id of ids) { import(`./${id}`); }', loadingPerformanceRules)).toEqual(["performance.dynamic-import-inside-hotpath", "performance.eager-heavy-route"]));
  it("distinguishes literal Promise.all from data-sized fanout", () => { expect(ruleIds('await Promise.all([a(), b()]);', asyncPerformanceRules)).not.toContain("performance.async.unbounded-promise-all"); expect(ruleIds('await Promise.all(ids.map(load));', asyncPerformanceRules)).toContain("performance.async.unbounded-promise-all"); });
  it("requires cleanup evidence for listeners and timers", () => { expect(ruleIds('window.addEventListener("x", handler); setInterval(work, 100);', memoryPerformanceRules)).toEqual(["performance.memory.listener-leak", "performance.memory.timer-leak"]); expect(ruleIds('window.addEventListener("x", handler); window.removeEventListener("x", handler);', memoryPerformanceRules)).not.toContain("performance.memory.listener-leak"); });
});
