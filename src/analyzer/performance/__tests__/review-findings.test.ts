import { describe, expect, it } from "vitest";
import { analyzeFile } from "../../index";
describe("performance review adapter", () => { it("includes deterministic performance findings in analyzer output", () => { const findings = analyzeFile("routes.ts", 'import _ from "lodash";'); expect(findings.some((finding) => finding.ruleId === "performance.heavy-library-whole-import" && finding.source === "performance")).toBe(true); }); });
