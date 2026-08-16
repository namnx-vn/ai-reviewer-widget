import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, callPath, finding, isLoop, visit } from "./ast-utils";
import { isConfiguredCritical } from "./critical-path-utils";

const criticalPathLatencyBoundaryRule: PerformanceRule = {
  meta: {
    id: "performance.observability.critical-path-without-latency-boundary",
    title: "Critical path without latency boundary",
    description: "A configured critical entrypoint has no configured timing/span adapter call.",
    category: "observability",
    defaultSeverity: "medium",
    defaultConfidence: "high",
  },
  check(context) {
    const telemetry = new Set(context.telemetryCallPaths ?? []);
    if (telemetry.size === 0) return [];
    const findings: PerformanceFinding[] = [];
    for (const entrypoint of criticalFunctions(context.ast, context.criticalEntrypoints ?? [])) {
      if (containsTelemetry(entrypoint.body, telemetry)) continue;
      findings.push(finding(
        this,
        context,
        entrypoint.node,
        this.meta.description,
        "Wrap the configured critical entrypoint in a latency span/timer boundary.",
      ));
    }
    return findings;
  },
};

const externalCallTimingRule: PerformanceRule = {
  meta: {
    id: "performance.observability.external-call-without-timing-context",
    title: "Critical external call without timing context",
    description: "A configured critical path makes an external call without configured timing context in the same function.",
    category: "observability",
    defaultSeverity: "medium",
    defaultConfidence: "high",
  },
  check(context) {
    const telemetry = new Set(context.telemetryCallPaths ?? []);
    if (telemetry.size === 0) return [];
    const findings: PerformanceFinding[] = [];
    for (const entrypoint of criticalFunctions(context.ast, context.criticalEntrypoints ?? [])) {
      if (containsTelemetry(entrypoint.body, telemetry)) continue;
      visit(entrypoint.body, (node) => {
        if (node.type !== "CallExpression" || !["fetch", "request", "get", "post", "put", "patch", "delete"].includes(callName(node) ?? "")) return;
        findings.push(finding(
          this,
          context,
          node,
          this.meta.description,
          "Wrap the external boundary in the configured timing/span adapter.",
        ));
      });
    }
    return findings;
  },
};

const retryAttemptContextRule: PerformanceRule = {
  meta: {
    id: "performance.observability.retry-without-attempt-context",
    title: "Retry telemetry without attempt context",
    description: "A retry loop in a configured critical path has telemetry but does not expose attempt context to the telemetry call.",
    category: "observability",
    defaultSeverity: "low",
    defaultConfidence: "medium",
  },
  check(context) {
    const telemetry = new Set(context.telemetryCallPaths ?? []);
    if (telemetry.size === 0) return [];
    const findings: PerformanceFinding[] = [];
    visit(context.ast, (node, ancestors) => {
      if (!isLoop(node) || !isConfiguredCritical(ancestors, context.criticalEntrypoints)) return;
      if (!containsExternalCall(node) || !containsTelemetry(node, telemetry)) return;
      if (telemetryHasAttemptContext(node, telemetry)) return;
      findings.push(finding(
        this,
        context,
        node,
        this.meta.description,
        "Include the bounded retry attempt number in the configured telemetry span/event context.",
      ));
    });
    return findings;
  },
};

export const observabilityPerformanceRules: readonly PerformanceRule[] = [
  criticalPathLatencyBoundaryRule,
  externalCallTimingRule,
  retryAttemptContextRule,
];

function criticalFunctions(
  ast: TSESTree.Program,
  names: readonly string[],
): readonly { readonly name: string; readonly body: TSESTree.Node; readonly node: TSESTree.Node }[] {
  const configured = new Set(names);
  const result: { name: string; body: TSESTree.Node; node: TSESTree.Node }[] = [];
  if (configured.size === 0) return result;
  visit(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id !== null && configured.has(node.id.name)) {
      result.push({ name: node.id.name, body: node.body, node });
    }
    if (node.type === "VariableDeclarator"
      && node.id.type === "Identifier"
      && configured.has(node.id.name)
      && node.init !== null
      && (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")) {
      result.push({ name: node.id.name, body: node.init.body, node });
    }
  });
  return result;
}

function containsTelemetry(node: TSESTree.Node, telemetry: ReadonlySet<string>): boolean {
  let found = false;
  visit(node, (child) => {
    if (child.type === "CallExpression" && telemetry.has(callPath(child) ?? "")) found = true;
  });
  return found;
}

function containsExternalCall(node: TSESTree.Node): boolean {
  let found = false;
  visit(node, (child) => {
    if (child.type === "CallExpression" && ["fetch", "request", "get", "post", "put", "patch", "delete"].includes(callName(child) ?? "")) found = true;
  });
  return found;
}

function telemetryHasAttemptContext(node: TSESTree.Node, telemetry: ReadonlySet<string>): boolean {
  let found = false;
  visit(node, (child) => {
    if (child.type !== "CallExpression" || !telemetry.has(callPath(child) ?? "")) return;
    for (const argument of child.arguments) {
      if (argument.type === "SpreadElement") continue;
      if (argument.type === "Identifier" && /attempt|retry/i.test(argument.name)) found = true;
      if (argument.type === "ObjectExpression" && argument.properties.some((property) => {
        if (property.type !== "Property" || property.computed) return false;
        const key = property.key.type === "Identifier" ? property.key.name : property.key.type === "Literal" ? String(property.key.value) : "";
        return /attempt|retry/i.test(key);
      })) found = true;
    }
  });
  return found;
}
