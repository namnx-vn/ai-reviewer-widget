import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, isLoop, visit } from "./ast-utils";

export const cpuPerformanceRules: readonly PerformanceRule[] = [
  createRule(
    "performance.algorithm.nested-loop-hotpath",
    "Nested dynamic loops",
    "A dynamic loop is nested inside another dynamic loop.",
    "Precompute an index or reshape the algorithm to avoid repeated traversal.",
    (node, ancestors) => isLoop(node) && ancestors.some(isLoop),
  ),
  createRule(
    "performance.algorithm.repeated-linear-search",
    "Repeated linear search",
    "A linear collection search is repeated from inside a loop.",
    "Build an indexed Set/Map before the repeated path when lookup semantics allow it.",
    (node, ancestors) => node.type === "CallExpression"
      && ["find", "findIndex", "includes", "indexOf"].includes(callName(node) ?? "")
      && ancestors.some(isLoop),
  ),
  createRule(
    "performance.algorithm.repeated-sort",
    "Sort in repeated path",
    "A sort operation occurs inside a loop.",
    "Sort once before the repeated path where semantics permit.",
    (node, ancestors) => node.type === "CallExpression"
      && ["sort", "toSorted"].includes(callName(node) ?? "")
      && ancestors.some(isLoop),
  ),
  createRule(
    "performance.algorithm.expensive-regex-loop",
    "Regular expression work in loop",
    "A dynamic regular expression is constructed or executed from inside a loop.",
    "Compile stable expressions before the repeated path and avoid pathological dynamic patterns.",
    (node, ancestors) => isRegexWork(node) && ancestors.some(isLoop),
  ),
  createRule(
    "performance.algorithm.repeated-serialization",
    "Serialization in repeated path",
    "JSON serialization or parsing occurs inside a loop.",
    "Move serialization outside the repeated path or batch the values.",
    (node, ancestors) => isJsonSerialization(node) && ancestors.some(isLoop),
  ),
];

function createRule(
  id: string,
  title: string,
  message: string,
  suggestion: string,
  predicate: (node: TSESTree.Node, ancestors: readonly TSESTree.Node[]) => boolean,
): PerformanceRule {
  return {
    meta: {
      id,
      title,
      description: message,
      category: "cpu",
      defaultSeverity: "medium",
      defaultConfidence: "high",
    },
    check(context) {
      const findings: PerformanceFinding[] = [];
      visit(context.ast, (node, ancestors) => {
        if (predicate(node, ancestors)) findings.push(finding(this, context, node, message, suggestion));
      });
      return findings;
    },
  };
}

function isRegexWork(node: TSESTree.Node): boolean {
  if (node.type === "NewExpression" && node.callee.type === "Identifier" && node.callee.name === "RegExp") return true;
  if (node.type !== "CallExpression") return false;
  const name = callName(node);
  return name === "test" || name === "exec" || name === "match" || name === "matchAll" || name === "replace";
}

function isJsonSerialization(node: TSESTree.Node): boolean {
  return node.type === "CallExpression"
    && node.callee.type === "MemberExpression"
    && node.callee.object.type === "Identifier"
    && node.callee.object.name === "JSON"
    && ["stringify", "parse"].includes(callName(node) ?? "");
}
