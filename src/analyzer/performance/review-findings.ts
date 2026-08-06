import type { ReviewFinding } from "../../review/types";
import { parseSource } from "../ast/parser";
import { PerformanceAnalysisEngine } from "./engine/performance-analysis-engine";
import type { PerformanceFinding, PerformanceRule } from "./model/types";
import { PerformanceRuleRegistry } from "./registry/performance-rule-registry";
import { assetPerformanceRules, asyncPerformanceRules, backpressurePerformanceRules, bankUiPerformanceRules, cachePerformanceRules, cpuPerformanceRules, databasePerformanceRules, importPerformanceRules, loadingPerformanceRules, memoryPerformanceRules, networkPerformanceRules, observabilityPerformanceRules, resiliencePerformanceRules, transactionPerformanceRules } from "./rules";

const DEFAULT_RULES: readonly PerformanceRule[] = [...importPerformanceRules, ...loadingPerformanceRules, ...networkPerformanceRules, ...asyncPerformanceRules, ...memoryPerformanceRules, ...assetPerformanceRules, ...cpuPerformanceRules, ...databasePerformanceRules, ...cachePerformanceRules, ...resiliencePerformanceRules, ...backpressurePerformanceRules, ...transactionPerformanceRules, ...observabilityPerformanceRules, ...bankUiPerformanceRules];
export function analyzePerformanceFindings(file: string, source: string): readonly ReviewFinding[] { const registry = new PerformanceRuleRegistry(); DEFAULT_RULES.forEach((rule) => registry.register(rule)); const findings = new PerformanceAnalysisEngine().analyze({ file, source, ast: parseSource(source) }, registry); return findings.map(toReviewFinding); }
function toReviewFinding(finding: PerformanceFinding): ReviewFinding { return { id: finding.id, ruleId: finding.ruleId, title: finding.title, message: finding.message, severity: finding.severity, source: "performance", location: { file: finding.location.path, line: finding.location.line, column: finding.location.column }, suggestion: finding.suggestion, confidence: confidenceScore(finding.confidence) }; }
function confidenceScore(confidence: PerformanceFinding["confidence"]): number { return confidence === "high" ? 1 : confidence === "medium" ? 0.75 : 0.5; }
