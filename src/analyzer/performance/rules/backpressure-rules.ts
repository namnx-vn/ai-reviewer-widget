import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, isLoop, visit } from "./ast-utils";

const EXTERNAL_CALLS = new Set(["fetch", "request", "send"]);
const STREAM_PRODUCERS = new Set(["write", "push", "enqueue"]);
const STREAM_CONTROLS = new Set(["pause", "resume", "drain", "pipe", "pipeline"]);
const LIMITERS = new Set(["limit", "pLimit", "pool", "batch", "chunk"]);

export const backpressurePerformanceRules: readonly PerformanceRule[] = [
  createRule(
    "performance.backpressure.unbounded-queue",
    "Unbounded queue growth",
    "A queue-like collection is appended from a repeated producer without local drain evidence.",
    "Bound the queue, batch work, or add a drain/pause mechanism.",
    (node, ancestors, context) => node.type === "CallExpression"
      && callName(node) === "push"
      && queueName(node) !== undefined
      && ancestors.some(isLoop)
      && !collectDrainedQueues(context.ast).has(queueName(node) ?? ""),
  ),
  createRule(
    "performance.backpressure.unbounded-producer",
    "Unbounded producer",
    "A dynamic loop produces stream/queue work without a local bound or consumer-control signal.",
    "Apply a queue capacity, await drain, or use bounded producer batches.",
    (node, ancestors, context) => node.type === "CallExpression"
      && STREAM_PRODUCERS.has(callName(node) ?? "")
      && ancestors.some(isLoop)
      && !hasControlEvidence(context.ast),
  ),
  createRule(
    "performance.backpressure.missing-stream-control",
    "Missing stream backpressure control",
    "Repeated stream writes occur without pause/drain/pipe/pipeline control evidence.",
    "Respect write backpressure or use pipeline/pipe with explicit lifecycle handling.",
    (node, ancestors, context) => node.type === "CallExpression"
      && callName(node) === "write"
      && ancestors.some(isLoop)
      && !hasControlEvidence(context.ast),
  ),
  createRule(
    "performance.backpressure.missing-concurrency-limit",
    "Unbounded concurrent fan-out",
    "Promise.all fans out work from a dynamic collection without limiter evidence.",
    "Use a configured concurrency limiter or bounded batches.",
    (node, ancestors) => isDynamicPromiseAll(node) && !ancestors.some(isLimiterCall),
  ),
  createRule(
    "performance.rate-control.hot-loop-external-call",
    "External call in hot loop",
    "A known external request is issued for every loop iteration without limiter evidence.",
    "Batch, cache, or rate-limit requests before issuing them in a loop.",
    (node, ancestors) => node.type === "CallExpression"
      && EXTERNAL_CALLS.has(callName(node) ?? "")
      && ancestors.some(isLoop)
      && !ancestors.some(isLimiterCall),
    "rate-control",
  ),
];

function createRule(
  id: string,
  title: string,
  message: string,
  suggestion: string,
  predicate: (
    node: TSESTree.Node,
    ancestors: readonly TSESTree.Node[],
    context: Parameters<PerformanceRule["check"]>[0],
  ) => boolean,
  category: "backpressure" | "rate-control" = "backpressure",
): PerformanceRule {
  return {
    meta: {
      id,
      title,
      description: message,
      category,
      defaultSeverity: "high",
      defaultConfidence: "high",
    },
    check(context) {
      const findings: PerformanceFinding[] = [];
      visit(context.ast, (node, ancestors) => {
        if (predicate(node, ancestors, context)) findings.push(finding(this, context, node, message, suggestion));
      });
      return findings;
    },
  };
}

function isDynamicPromiseAll(node: TSESTree.Node): boolean {
  return node.type === "CallExpression"
    && node.callee.type === "MemberExpression"
    && !node.callee.computed
    && node.callee.object.type === "Identifier"
    && node.callee.object.name === "Promise"
    && node.callee.property.type === "Identifier"
    && node.callee.property.name === "all"
    && node.arguments[0]?.type === "CallExpression"
    && ["map", "flatMap"].includes(callName(node.arguments[0]) ?? "")
    && node.arguments[0].callee.type === "MemberExpression"
    && node.arguments[0].callee.object.type !== "ArrayExpression";
}

function queueName(node: TSESTree.CallExpression): string | undefined {
  return node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier"
    ? node.callee.object.name
    : undefined;
}

function collectDrainedQueues(ast: TSESTree.Program): ReadonlySet<string> {
  const drained = new Set<string>();
  visit(ast, (node) => {
    if (node.type !== "CallExpression" || !["shift", "splice", "pop", "clear"].includes(callName(node) ?? "")) return;
    const name = queueName(node);
    if (name !== undefined) drained.add(name);
  });
  return drained;
}

function hasControlEvidence(ast: TSESTree.Program): boolean {
  let found = false;
  visit(ast, (node) => {
    if (node.type === "CallExpression" && (STREAM_CONTROLS.has(callName(node) ?? "") || isLimiterCall(node))) found = true;
  });
  return found;
}

function isLimiterCall(node: TSESTree.Node): boolean {
  return node.type === "CallExpression" && LIMITERS.has(callName(node) ?? "");
}
