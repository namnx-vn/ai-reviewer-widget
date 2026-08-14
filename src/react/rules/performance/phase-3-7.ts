import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { ReviewFinding } from "../../../review/types";
import type { ReactRule, ReactRuleContext } from "../../engine/react-rule";
import { reactContextConsumerInvalidationRule } from "../context";
import { reactRenderingUnstablePropsRule } from "../rendering";
import { reactPerformanceExpensiveRenderWorkRule } from "./expensive-render-work";
import { reactPerformanceRepeatedDerivedComputationRule } from "./repeated-derived-computation";

export const performanceLargeComponentRule: ReactRule = {
  id: "performance.large-component",
  description: "Detect structurally complex React components using JSX, branch, and repeated-work evidence.",
  check(node, context) {
    if (!isNamedComponent(node)) return [];
    const metrics = componentMetrics(node);
    if (metrics.jsxElements < 12 || metrics.branches < 3 || metrics.repeatedWork < 2) return [];
    return [createFinding(
      this.id,
      "Structurally large component",
      `Component ${node.id?.name ?? "component"} contains ${metrics.jsxElements} JSX elements, ${metrics.branches} branch points, and ${metrics.repeatedWork} repeated collection operations.`,
      node,
      context.file,
      "Split independent rendering responsibilities or move derived work into focused child boundaries.",
      0.88,
    )];
  },
};

export const performanceReactUnstablePropRule = adaptRule(
  reactRenderingUnstablePropsRule,
  "performance.react.unstable-prop",
  "Unstable React prop",
);

export const performanceReactExpensiveRenderComputationRule = adaptRule(
  reactPerformanceExpensiveRenderWorkRule,
  "performance.react.expensive-render-computation",
  "Expensive render computation",
);

export const performanceReactContextBroadRerenderRule = adaptRule(
  reactContextConsumerInvalidationRule,
  "performance.react.context-broad-rerender",
  "Broad context re-render risk",
);

export const performanceReactRepeatedDerivedComputationRule = adaptRule(
  reactPerformanceRepeatedDerivedComputationRule,
  "performance.react.repeated-derived-computation",
  "Repeated derived computation",
);

export const performanceReactListWithHeavyChildRule: ReactRule = {
  id: "performance.react.list-with-heavy-child",
  description: "Detect list rendering whose callback performs repeated expensive collection or serialization work.",
  check(node, context) {
    if (node.type !== "CallExpression" || memberName(node) !== "map") return [];
    const callback = node.arguments[0];
    if (callback === undefined || callback.type === "SpreadElement") return [];
    if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") return [];
    const expensiveOperations = countCalls(callback.body, new Set(["sort", "toSorted", "reduce", "stringify"]));
    if (expensiveOperations < 2 || !containsJsx(callback.body)) return [];
    return [createFinding(
      this.id,
      "Heavy child work inside list render",
      `A list render callback performs ${expensiveOperations} expensive operations before producing JSX.`,
      node,
      context.file,
      "Precompute shared derived data and move heavy child work behind memoized or virtualized boundaries where justified.",
      0.86,
    )];
  },
};

export const performanceBankUiBlockingCriticalRenderRule: ReactRule = bankingRule(
  "performance.bank-ui.blocking-critical-render",
  "Blocking critical banking render",
  (component) => componentMetrics(component).repeatedWork >= 2,
  "A configured banking-critical component performs repeated collection work during render.",
  "Move expensive derivation outside the critical render path or memoize only when input-driven cost justifies it.",
);

export const performanceBankUiSequentialCriticalFetchRule: ReactRule = bankingRule(
  "performance.bank-ui.sequential-critical-fetch",
  "Sequential critical banking fetch",
  (component) => countAwaitedFetches(component) >= 2,
  "A configured banking-critical component contains multiple sequential awaited request boundaries.",
  "Start independent requests together or move orchestration to a bounded data-loading layer.",
);

export const performanceBankUiEagerNoncriticalFeatureRule: ReactRule = bankingRule(
  "performance.bank-ui.eager-noncritical-feature",
  "Eager noncritical feature on banking journey",
  (_component, context) => context.ast.body.some((statement) =>
    statement.type === "ImportDeclaration"
    && statement.importKind !== "type"
    && /(?:reports?|analytics|export|help|marketing|optional)/i.test(statement.source.value)),
  "A configured banking-critical journey eagerly imports an optional/noncritical feature.",
  "Lazy-load the noncritical feature after the critical interaction is usable.",
);

export const performanceBankUiLargeCriticalRouteRule: ReactRule = bankingRule(
  "performance.bank-ui.large-critical-route",
  "Large critical banking route",
  (component) => {
    const metrics = componentMetrics(component);
    return metrics.jsxElements >= 16 && metrics.branches >= 3;
  },
  "A configured banking-critical route has high structural rendering complexity.",
  "Split noncritical panels and defer optional sections outside the initial critical route boundary.",
);

export const performanceBankUiDuplicateCriticalRequestRule: ReactRule = bankingRule(
  "performance.bank-ui.duplicate-critical-request",
  "Duplicate request on critical banking journey",
  (component) => hasDuplicateLiteralFetch(component),
  "A configured banking-critical component issues the same literal request more than once.",
  "Coalesce the request or share the result through the journey data boundary.",
);

export const phase37ReactPerformanceRules: readonly ReactRule[] = [
  performanceLargeComponentRule,
  performanceReactUnstablePropRule,
  performanceReactExpensiveRenderComputationRule,
  performanceReactListWithHeavyChildRule,
  performanceReactContextBroadRerenderRule,
  performanceReactRepeatedDerivedComputationRule,
  performanceBankUiBlockingCriticalRenderRule,
  performanceBankUiSequentialCriticalFetchRule,
  performanceBankUiEagerNoncriticalFeatureRule,
  performanceBankUiLargeCriticalRouteRule,
  performanceBankUiDuplicateCriticalRequestRule,
];

function adaptRule(rule: ReactRule, id: string, title: string): ReactRule {
  return {
    id,
    description: rule.description,
    check(node, context) {
      return rule.check(node, context).map((item) => ({
        ...item,
        id: [id, item.location?.file ?? context.file, item.location?.line ?? 1, item.location?.column ?? 0].join(":"),
        ruleId: id,
        title,
        source: "performance",
      }));
    },
  };
}

function bankingRule(
  id: string,
  title: string,
  predicate: (component: ComponentNode, context: ReactRuleContext) => boolean,
  message: string,
  suggestion: string,
): ReactRule {
  return {
    id,
    description: message,
    check(node, context) {
      if (!isNamedComponent(node)) return [];
      const critical = new Set(context.performance?.criticalUiComponents ?? []);
      const name = node.id?.name;
      if (name === undefined || !critical.has(name) || !predicate(node, context)) return [];
      return [createFinding(id, title, message, node, context.file, suggestion, 0.9)];
    },
  };
}

type ComponentNode = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;

function isNamedComponent(node: TSESTree.Node): node is ComponentNode {
  if (node.type === "FunctionDeclaration") return node.id !== null && /^[A-Z]/.test(node.id.name);
  return node.type === "FunctionExpression" && node.id !== null && /^[A-Z]/.test(node.id.name);
}

function componentMetrics(node: ComponentNode): { readonly jsxElements: number; readonly branches: number; readonly repeatedWork: number } {
  let jsxElements = 0;
  let branches = 0;
  let repeatedWork = 0;
  walk(node.body, (child) => {
    if (child.type === "JSXElement" || child.type === "JSXFragment") jsxElements += 1;
    if (child.type === "IfStatement" || child.type === "ConditionalExpression" || child.type === "SwitchStatement" || child.type === "LogicalExpression") branches += 1;
    if (child.type === "CallExpression" && ["map", "filter", "reduce", "sort", "toSorted"].includes(memberName(child) ?? "")) repeatedWork += 1;
  });
  return { jsxElements, branches, repeatedWork };
}

function countAwaitedFetches(node: ComponentNode): number {
  let count = 0;
  walk(node.body, (child, ancestors) => {
    if (child.type === "CallExpression"
      && ["fetch", "request"].includes(memberName(child) ?? "")
      && ancestors.some((ancestor) => ancestor.type === "AwaitExpression")) count += 1;
  });
  return count;
}

function hasDuplicateLiteralFetch(node: ComponentNode): boolean {
  const requests = new Map<string, number>();
  walk(node.body, (child) => {
    if (child.type !== "CallExpression" || !["fetch", "request"].includes(memberName(child) ?? "")) return;
    const argument = child.arguments[0];
    if (argument?.type !== "Literal" || typeof argument.value !== "string") return;
    requests.set(argument.value, (requests.get(argument.value) ?? 0) + 1);
  });
  return [...requests.values()].some((count) => count > 1);
}

function containsJsx(node: TSESTree.Node): boolean {
  let found = false;
  walk(node, (child) => {
    if (child.type === "JSXElement" || child.type === "JSXFragment") found = true;
  });
  return found;
}

function countCalls(node: TSESTree.Node, names: ReadonlySet<string>): number {
  let count = 0;
  walk(node, (child) => {
    if (child.type === "CallExpression" && names.has(memberName(child) ?? "")) count += 1;
  });
  return count;
}

function memberName(node: TSESTree.CallExpression): string | undefined {
  if (node.callee.type === "Identifier") return node.callee.name;
  return node.callee.type === "MemberExpression"
    && !node.callee.computed
    && node.callee.property.type === "Identifier"
      ? node.callee.property.name
      : undefined;
}

function walk(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node, ancestors: readonly TSESTree.Node[]) => void,
  ancestors: readonly TSESTree.Node[] = [],
): void {
  callback(node, ancestors);
  for (const value of Object.values(node)) {
    if (isNode(value)) walk(value, callback, [...ancestors, node]);
    else if (Array.isArray(value)) for (const item of value) if (isNode(item)) walk(item, callback, [...ancestors, node]);
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

function createFinding(
  id: string,
  title: string,
  message: string,
  node: TSESTree.Node,
  file: string,
  suggestion: string,
  confidence: number,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;
  return {
    id: [id, file, line, column].join(":"),
    ruleId: id,
    title,
    message,
    severity: "medium",
    source: "performance",
    location: { file, line, column },
    suggestion,
    confidence,
  };
}
