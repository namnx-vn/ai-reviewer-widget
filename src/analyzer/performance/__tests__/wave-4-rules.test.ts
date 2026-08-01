import { describe, expect, it } from "vitest";
import { parseSource } from "../../ast/parser";
import { assetPerformanceRules, cpuPerformanceRules, databasePerformanceRules, PerformanceAnalysisEngine, PerformanceRuleRegistry, type PerformanceRule } from "..";
function findings(source: string, rules: readonly PerformanceRule[], databaseAdapters?: readonly { readonly callPaths: readonly string[]; readonly collectionMethods?: readonly string[] }[]): readonly string[] { const registry = new PerformanceRuleRegistry(); rules.forEach((rule) => registry.register(rule)); return new PerformanceAnalysisEngine().analyze({ file: "feature.tsx", source, ast: parseSource(source), databaseAdapters }, registry).map((item) => item.ruleId); }
describe("wave 4 performance rules", () => {
  it("checks image delivery attributes", () => expect(findings('const View = () => <img src="x" />;', assetPerformanceRules)).toEqual(["performance.image.missing-dimensions", "performance.image.missing-lazy"]));
  it("finds repeated CPU work", () => expect(findings('for (const x of xs) { for (const y of ys) {} items.sort(); JSON.stringify(x); }', cpuPerformanceRules)).toEqual(["performance.algorithm.nested-loop-hotpath", "performance.algorithm.repeated-serialization", "performance.algorithm.repeated-sort"]));
  it("uses only configured database adapters", () => { expect(findings('for (const id of ids) { db.user.find(id); } db.user.list();', databasePerformanceRules, [{ callPaths: ["db.user.find", "db.user.list"], collectionMethods: ["db.user.list"] }])).toEqual(["performance.database.missing-pagination", "performance.database.query-in-loop"]); expect(findings('for (const id of ids) { db.user.find(id); }', databasePerformanceRules)).toEqual([]); });
});
