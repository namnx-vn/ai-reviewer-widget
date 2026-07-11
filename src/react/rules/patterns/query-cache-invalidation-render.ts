import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { visit } from "../../ast/component-utils";
import type { ReviewFinding } from "../../../review/types";
import type { ReactRuleContext } from "../../engine/react-rule";
import type { ReactRule } from "../../engine/react-rule";
import type { ComponentMetadata } from "../../semantic/component-analyzer";
import {
  findEnclosingComponent,
  isRenderPhaseNode,
} from "../performance/semantic";
import { getReactQueryApiName } from "./library-context";

const RULE_ID = "react.patterns.query-cache-invalidation-render";
const INVALIDATION_METHODS = new Set([
  "invalidateQueries",
  "refetchQueries",
  "resetQueries",
  "removeQueries",
]);
const clientCache = new WeakMap<TSESTree.Node, ReadonlySet<string>>();

export const reactPatternsQueryCacheInvalidationRenderRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect React Query cache invalidation triggered directly during component render.",

  check(node, context) {
    if (
      node.type !== "CallExpression" ||
      !isRenderPhaseNode(node, context) ||
      node.callee.type !== "MemberExpression" ||
      node.callee.computed ||
      node.callee.object.type !== "Identifier" ||
      node.callee.property.type !== "Identifier" ||
      !INVALIDATION_METHODS.has(node.callee.property.name)
    ) {
      return [];
    }

    const component = findEnclosingComponent(node, context);

    if (
      component === undefined ||
      !getQueryClientNames(context, component).has(
        node.callee.object.name,
      )
    ) {
      return [];
    }

    return [createFinding(context.file, node)];
  },
};

function getQueryClientNames(
  context: ReactRuleContext,
  component: ComponentMetadata,
): ReadonlySet<string> {
  const cached = clientCache.get(component.node);

  if (cached !== undefined) {
    return cached;
  }

  const names = new Set<string>();

  visit(component.node, (node) => {
    if (
      findEnclosingComponent(node, context) !== component ||
      node.type !== "VariableDeclarator" ||
      node.id.type !== "Identifier" ||
      node.init?.type !== "CallExpression" ||
      getReactQueryApiName(node.init, context) !== "useQueryClient"
    ) {
      return;
    }

    names.add(node.id.name);
  });

  clientCache.set(component.node, names);

  return names;
}

function createFinding(
  file: string,
  node: TSESTree.CallExpression,
): ReviewFinding {
  return {
    id: [
      RULE_ID,
      file,
      node.loc?.start.line ?? 1,
      node.loc?.start.column ?? 0,
    ].join(":"),
    ruleId: RULE_ID,
    title: "React Query cache invalidated during render",
    message:
      "This cache invalidation runs directly in the component render path, so every render can trigger another cache transition or refetch.",
    severity: "high",
    source: "ast",
    location: {
      file,
      line: node.loc?.start.line ?? 1,
      column: node.loc?.start.column ?? 0,
    },
    suggestion:
      "Move cache invalidation to the event, mutation callback, or effect that represents the actual state transition.",
    confidence: 0.99,
  };
}
