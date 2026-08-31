import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, isLoop, visit } from "./ast-utils";

function objectHasKey(node: TSESTree.ObjectExpression, key: string): boolean { return node.properties.some((property) => property.type === "Property" && !property.computed && ((property.key.type === "Identifier" && property.key.name === key) || (property.key.type === "Literal" && property.key.value === key))); }
function callContainsAbortTimeout(node: TSESTree.CallExpression): boolean { let found = false; visit(node, (child) => { if (child.type === "CallExpression" && child.callee.type === "MemberExpression" && !child.callee.computed && child.callee.object.type === "Identifier" && child.callee.object.name === "AbortSignal" && child.callee.property.type === "Identifier" && child.callee.property.name === "timeout") found = true; }); return found; }
function fetchHasTimeout(node: TSESTree.CallExpression): boolean { const options = node.arguments[1]; return (options?.type === "ObjectExpression" && (objectHasKey(options, "signal") || objectHasKey(options, "timeout"))) || callContainsAbortTimeout(node); }
function fetchMethod(node: TSESTree.CallExpression): string { const options = node.arguments[1]; if (options?.type !== "ObjectExpression") return "GET"; for (const property of options.properties) { if (property.type !== "Property" || property.computed) continue; const isMethod = (property.key.type === "Identifier" && property.key.name === "method") || (property.key.type === "Literal" && property.key.value === "method"); if (isMethod && property.value.type === "Literal" && typeof property.value.value === "string") return property.value.value.toUpperCase(); } return "GET"; }
function networkCall(node: TSESTree.CallExpression): boolean { const name = callName(node); return name === "fetch" || name === "request" || name === "get" || name === "post" || name === "put" || name === "patch" || name === "delete"; }
function hasCallWithin(node: TSESTree.Node, names: readonly string[]): boolean { let found = false; visit(node, (child) => { if (child.type === "CallExpression" && names.includes(callName(child) ?? "")) found = true; }); return found; }
function hasNetworkWithin(node: TSESTree.Node): boolean { let found = false; visit(node, (child) => { if (child.type === "CallExpression" && networkCall(child)) found = true; }); return found; }
function isObviouslyUnbounded(node: TSESTree.Node): boolean { if (node.type === "ForStatement") return node.test === null; if (node.type !== "WhileStatement") return false; return node.test.type === "Literal" && node.test.value === true; }

const definitions = [
  ["performance.resilience.missing-timeout", "Missing request timeout", "A modeled fetch call has no visible abort signal or timeout configuration.", "Use an AbortSignal/timeout that reflects the caller latency budget."],
  ["performance.resilience.unbounded-retry", "Unbounded retry", "A network operation occurs in an obviously unbounded retry loop.", "Set a deterministic retry cap and stop condition."],
  ["performance.resilience.retry-without-backoff", "Retry without backoff", "A retry loop performs network work without visible delay or backoff.", "Add bounded exponential backoff between attempts."],
  ["performance.resilience.retry-without-jitter", "Retry without jitter", "A retry loop has delay/backoff but no visible jitter source.", "Add bounded jitter to avoid synchronized retry waves."],
  ["performance.resilience.retry-non-idempotent", "Retry of non-idempotent request", "A non-idempotent fetch request is retried inside a loop.", "Require an idempotency key or operation-specific replay protection before retrying."],
  ["performance.resilience.retry-amplification", "Retry amplification risk", "A network call is nested across multiple retry/loop boundaries.", "Collapse retry ownership to one layer and bound total attempts."],
] as const;

export const resiliencePerformanceRules: readonly PerformanceRule[] = definitions.map(([id, title, message, suggestion]) => ({
  meta: { id, title, description: message, category: "resilience", defaultSeverity: id === "performance.resilience.retry-non-idempotent" || id === "performance.resilience.unbounded-retry" ? "high" : "medium", defaultConfidence: "high" },
  check(context) {
    const findings: PerformanceFinding[] = [];
    visit(context.ast, (node, ancestors) => {
      if (id === "performance.resilience.missing-timeout" && node.type === "CallExpression" && callName(node) === "fetch" && !fetchHasTimeout(node)) findings.push(finding(this, context, node, message, suggestion));
      if (!isLoop(node) || !hasNetworkWithin(node)) return;
      if (id === "performance.resilience.unbounded-retry" && isObviouslyUnbounded(node)) findings.push(finding(this, context, node, message, suggestion));
      const hasBackoff = hasCallWithin(node, ["setTimeout", "sleep", "delay", "backoff"]);
      if (id === "performance.resilience.retry-without-backoff" && !hasBackoff) findings.push(finding(this, context, node, message, suggestion));
      if (id === "performance.resilience.retry-without-jitter" && hasBackoff && !context.source.includes("Math.random")) findings.push(finding(this, context, node, message, suggestion));
      if (id === "performance.resilience.retry-amplification" && ancestors.filter(isLoop).length > 0) findings.push(finding(this, context, node, message, suggestion));
      if (id === "performance.resilience.retry-non-idempotent") {
        let nonIdempotent: TSESTree.CallExpression | undefined;
        visit(node, (child) => { if (nonIdempotent !== undefined || child.type !== "CallExpression" || callName(child) !== "fetch") return; if (["POST", "PATCH", "DELETE"].includes(fetchMethod(child))) nonIdempotent = child; });
        if (nonIdempotent !== undefined) findings.push(finding(this, context, nonIdempotent, message, suggestion));
      }
    });
    return findings;
  },
}));
