import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, isLoop, visit } from "./ast-utils";

const HEAVY_OPTIONAL_SEGMENTS = /(?:^|\/)(?:charts?|editors?|maps?|pdf|reports?|analytics|export|admin|optional)(?:\/|$)/i;
const ROUTE_SEGMENTS = /(?:^|\/)(?:routes?|pages?)(?:\/|$)/i;

export const loadingPerformanceRules: readonly PerformanceRule[] = [
  importRule(
    "performance.missing-lazy",
    "Heavy component missing lazy boundary",
    "A structurally heavy optional UI module is imported synchronously without lazy-loading evidence.",
    (source) => HEAVY_OPTIONAL_SEGMENTS.test(source),
    "Load the component through React.lazy or a supported route/framework lazy boundary.",
  ),
  importRule(
    "performance.eager-heavy-route",
    "Eager route import",
    "A route-like module is imported synchronously.",
    (source) => ROUTE_SEGMENTS.test(source),
    "Load route-level modules through a supported lazy boundary when they are not needed for the initial route.",
  ),
  importRule(
    "performance.eager-optional-feature",
    "Eager optional feature",
    "An optional feature boundary is imported eagerly into the current module.",
    (source) => HEAVY_OPTIONAL_SEGMENTS.test(source) && !ROUTE_SEGMENTS.test(source),
    "Defer the optional feature until the user path that needs it is activated.",
  ),
  dynamicImportHotpathRule,
];

function importRule(
  id: string,
  title: string,
  message: string,
  matches: (source: string) => boolean,
  suggestion: string,
): PerformanceRule {
  return {
    meta: {
      id,
      title,
      description: message,
      category: "loading",
      defaultSeverity: "medium",
      defaultConfidence: "high",
    },
    check(context) {
      const hasLazyBoundary = hasLazyLoadingEvidence(context.ast);
      if (id === "performance.missing-lazy" && hasLazyBoundary) return [];
      return context.ast.body.flatMap((node) =>
        node.type === "ImportDeclaration"
        && node.importKind !== "type"
        && matches(node.source.value)
          ? [finding(this, context, node, message, suggestion)]
          : [],
      );
    },
  };
}

const dynamicImportHotpathRule: PerformanceRule = {
  meta: {
    id: "performance.dynamic-import-inside-hotpath",
    title: "Dynamic import in repeated path",
    description: "A dynamic import is created from a loop or repeated collection callback.",
    category: "loading",
    defaultSeverity: "medium",
    defaultConfidence: "high",
  },
  check(context) {
    const findings: PerformanceFinding[] = [];
    visit(context.ast, (node, ancestors) => {
      if (node.type !== "ImportExpression") return;
      if (!ancestors.some((ancestor) => isLoop(ancestor) || isRepeatedCallback(ancestor))) return;
      findings.push(finding(
        this,
        context,
        node,
        this.meta.description,
        "Hoist and cache the import promise outside the repeated path.",
      ));
    });
    return findings;
  },
};

function hasLazyLoadingEvidence(ast: TSESTree.Program): boolean {
  let found = false;
  visit(ast, (node) => {
    if (node.type !== "CallExpression") return;
    if (callName(node) === "lazy") found = true;
    if (node.callee.type === "Import") found = true;
  });
  return found;
}

function isRepeatedCallback(node: TSESTree.Node): boolean {
  if (node.type !== "CallExpression") return false;
  return ["map", "forEach", "flatMap", "filter", "reduce"].includes(callName(node) ?? "");
}
