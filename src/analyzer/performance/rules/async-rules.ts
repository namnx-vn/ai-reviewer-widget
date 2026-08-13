import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, isLoop, visit } from "./ast-utils";

const RESOURCE_CALLS = new Set(["fetch", "request", "setTimeout", "setInterval"]);
const LIMITER_CALLS = new Set(["pLimit", "limit", "pool", "chunk", "batch"]);

export const asyncPerformanceRules: readonly PerformanceRule[] = [
  createRule(
    "performance.async.serial-await",
    "Await inside loop",
    "An awaited operation occurs inside a loop and serializes each iteration.",
    "Use bounded concurrency when iterations are independent and resource limits permit it.",
    (node, ancestors) => node.type === "AwaitExpression" && ancestors.some(isLoop),
  ),
  createRule(
    "performance.async.unbounded-promise-all",
    "Unbounded Promise.all",
    "Promise.all receives work derived from a non-literal collection.",
    "Chunk work or use a configured concurrency limiter.",
    (node, ancestors) => isDynamicPromiseAll(node) && !ancestors.some(hasLimiterEvidence),
  ),
  createRule(
    "performance.async.unbounded-concurrency",
    "Unbounded concurrent work",
    "Concurrent work is derived from a data-sized collection without an explicit bound.",
    "Apply a concurrency pool, limiter, or deterministic batch size.",
    (node, ancestors) => isUnboundedConcurrentMap(node) && !ancestors.some(hasLimiterEvidence),
  ),
  createRule(
    "performance.async.promise-created-in-loop",
    "Promise created in loop",
    "A promise-producing operation is created for every loop iteration without a bounded concurrency owner.",
    "Use an awaited bounded worker pool or collect a statically bounded set of tasks.",
    (node, ancestors) => isPromiseProducer(node) && ancestors.some(isLoop) && !ancestors.some(hasLimiterEvidence),
  ),
  createRule(
    "performance.async.fire-and-forget-resource-work",
    "Unobserved asynchronous work",
    "A resource-like asynchronous call is not awaited, returned, or explicitly observed.",
    "Await, return, or explicitly handle the task lifecycle and failures.",
    (node, ancestors) => node.type === "CallExpression"
      && RESOURCE_CALLS.has(callName(node) ?? "")
      && !ancestors.some((ancestor) => ancestor.type === "AwaitExpression"
        || ancestor.type === "ReturnStatement"
        || ancestor.type === "VariableDeclarator"),
    "low",
  ),
];

function createRule(
  id: string,
  title: string,
  message: string,
  suggestion: string,
  predicate: (node: TSESTree.Node, ancestors: readonly TSESTree.Node[]) => boolean,
  severity: "high" | "low" = "high",
): PerformanceRule {
  return {
    meta: {
      id,
      title,
      description: message,
      category: "async",
      defaultSeverity: severity,
      defaultConfidence: "high",
    },
    check(context) {
      const matches: PerformanceFinding[] = [];
      visit(context.ast, (node, ancestors) => {
        if (predicate(node, ancestors)) {
          matches.push(finding(this, context, node, message, suggestion));
        }
      });
      return matches;
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
    && !isStaticallyBoundedCollection(node.arguments[0]);
}

function isUnboundedConcurrentMap(node: TSESTree.Node): boolean {
  if (node.type !== "CallExpression" || !["map", "flatMap"].includes(callName(node) ?? "")) return false;
  const callback = node.arguments[0];
  if (callback === undefined || callback.type === "SpreadElement") return false;
  let asyncWork = false;
  visit(callback, (child) => {
    if (child.type === "AwaitExpression" || child.type === "NewExpression" && child.callee.type === "Identifier" && child.callee.name === "Promise") {
      asyncWork = true;
    }
    if (child.type === "CallExpression" && RESOURCE_CALLS.has(callName(child) ?? "")) asyncWork = true;
  });
  return asyncWork && !isStaticallyBoundedCollection(node);
}

function isPromiseProducer(node: TSESTree.Node): boolean {
  if (node.type === "NewExpression" && node.callee.type === "Identifier" && node.callee.name === "Promise") return true;
  return node.type === "CallExpression" && RESOURCE_CALLS.has(callName(node) ?? "");
}

function isStaticallyBoundedCollection(mapCall: TSESTree.CallExpression): boolean {
  if (mapCall.callee.type !== "MemberExpression") return false;
  const object = mapCall.callee.object;
  return object.type === "ArrayExpression" && object.elements.length <= 8;
}

function hasLimiterEvidence(node: TSESTree.Node): boolean {
  if (node.type !== "CallExpression") return false;
  return LIMITER_CALLS.has(callName(node) ?? "");
}
