import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, visit } from "./ast-utils";
import { isConfiguredCritical } from "./critical-path-utils";
const rule: PerformanceRule = { meta: { id: "performance.bank-ui.blocking-critical-render", title: "Blocking critical UI render", description: "A configured critical UI component performs blocking collection work during render.", category: "bank-ui", defaultSeverity: "high", defaultConfidence: "high" }, check(context) { const findings: PerformanceFinding[] = []; visit(context.ast, (node, ancestors) => { if (node.type === "CallExpression" && isConfiguredCritical(ancestors, context.criticalUiComponents) && ["sort", "reduce"].includes(callName(node) ?? "")) findings.push(finding(this, context, node, this.meta.description, "Precompute the derived value before the critical render path.")); }); return findings; } };
export const bankUiPerformanceRules: readonly PerformanceRule[] = [rule];
