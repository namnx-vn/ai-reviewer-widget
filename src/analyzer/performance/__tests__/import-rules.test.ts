import { describe, expect, it } from "vitest";
import { parseSource } from "../../ast/parser";
import { PerformanceAnalysisEngine, PerformanceRuleRegistry, importPerformanceRules } from "..";
describe("performance import rules", () => { it("ignores type imports and identifies a heavy whole import", () => { const registry = new PerformanceRuleRegistry(); importPerformanceRules.forEach((rule) => registry.register(rule)); const findings = new PerformanceAnalysisEngine().analyze({ file: "file.ts", source: "", ast: parseSource('import type { X } from "lodash"; import _ from "lodash";') }, registry); expect(findings.map((finding) => finding.ruleId)).toEqual(["performance.heavy-library-whole-import"]); }); });
