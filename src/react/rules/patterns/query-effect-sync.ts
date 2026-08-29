import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { visit } from "../../ast/component-utils";
import type { ReviewFinding } from "../../../domain/review";
import type { ReactRuleContext } from "../../engine/react-rule";
import type { ReactRule } from "../../engine/react-rule";
import type { ComponentMetadata } from "../../semantic/component-analyzer";
import { findEnclosingComponent } from "../performance/semantic";
import { getReactQueryApiName } from "./library-context";

const RULE_ID = "react.patterns.query-effect-sync";

interface QueryDataBindings {
  readonly directDataNames: ReadonlySet<string>;
  readonly queryObjectNames: ReadonlySet<string>;
}

const queryDataCache = new WeakMap<TSESTree.Node, QueryDataBindings>();
const stateSetterCache = new WeakMap<TSESTree.Node, ReadonlySet<string>>();

export const reactPatternsQueryEffectSyncRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect effects that mirror React Query server data into local component state.",

  check(node, context) {
    if (
      node.type !== "CallExpression" ||
      getCallName(node) !== "useEffect"
    ) {
      return [];
    }

    const component = findEnclosingComponent(node, context);

    if (component === undefined) {
      return [];
    }

    const setterCall = getSingleSetterCall(
      node,
      getStateSetterNames(context, component),
    );

    if (setterCall === undefined) {
      return [];
    }

    const value = setterCall.arguments[0];

    if (
      value === undefined ||
      value.type === "SpreadElement" ||
      !referencesQueryData(
        value,
        getQueryDataBindings(context, component),
      )
    ) {
      return [];
    }

    return [createFinding(context.file, node)];
  },
};

function getQueryDataBindings(
  context: ReactRuleContext,
  component: ComponentMetadata,
): QueryDataBindings {
  const cached = queryDataCache.get(component.node);

  if (cached !== undefined) {
    return cached;
  }

  const directDataNames = new Set<string>();
  const queryObjectNames = new Set<string>();

  visit(component.node, (node) => {
    if (
      findEnclosingComponent(node, context) !== component ||
      node.type !== "VariableDeclarator" ||
      node.init?.type !== "CallExpression"
    ) {
      return;
    }

    const apiName = getReactQueryApiName(node.init, context);

    if (apiName !== "useQuery" && apiName !== "useInfiniteQuery") {
      return;
    }

    if (node.id.type === "Identifier") {
      queryObjectNames.add(node.id.name);
      return;
    }

    if (node.id.type !== "ObjectPattern") {
      return;
    }

    for (const property of node.id.properties) {
      if (
        property.type !== "Property" ||
        property.computed ||
        getPropertyName(property.key) !== "data"
      ) {
        continue;
      }

      collectBindingNames(property.value, directDataNames);
    }
  });

  const result: QueryDataBindings = {
    directDataNames,
    queryObjectNames,
  };

  queryDataCache.set(component.node, result);

  return result;
}

function getStateSetterNames(
  context: ReactRuleContext,
  component: ComponentMetadata,
): ReadonlySet<string> {
  const cached = stateSetterCache.get(component.node);

  if (cached !== undefined) {
    return cached;
  }

  const names = new Set<string>();

  visit(component.node, (node) => {
    if (
      findEnclosingComponent(node, context) !== component ||
      node.type !== "VariableDeclarator" ||
      node.id.type !== "ArrayPattern" ||
      node.init?.type !== "CallExpression" ||
      getCallName(node.init) !== "useState"
    ) {
      return;
    }

    const setter = node.id.elements[1];

    if (setter?.type === "Identifier") {
      names.add(setter.name);
    }
  });

  stateSetterCache.set(component.node, names);

  return names;
}

function getSingleSetterCall(
  effect: TSESTree.CallExpression,
  setters: ReadonlySet<string>,
): TSESTree.CallExpression | undefined {
  const callback = effect.arguments[0];

  if (
    callback?.type !== "ArrowFunctionExpression" &&
    callback?.type !== "FunctionExpression"
  ) {
    return undefined;
  }

  if (
    callback.body.type !== "BlockStatement" ||
    callback.body.body.length !== 1
  ) {
    return undefined;
  }

  const statement = callback.body.body[0];

  if (
    statement.type !== "ExpressionStatement" ||
    statement.expression.type !== "CallExpression" ||
    statement.expression.callee.type !== "Identifier" ||
    !setters.has(statement.expression.callee.name)
  ) {
    return undefined;
  }

  return statement.expression;
}

function referencesQueryData(
  node: TSESTree.Node,
  bindings: QueryDataBindings,
): boolean {
  let found = false;

  visit(node, (child) => {
    if (found) {
      return;
    }

    if (
      child.type === "Identifier" &&
      bindings.directDataNames.has(child.name)
    ) {
      found = true;
      return;
    }

    if (
      child.type === "MemberExpression" &&
      !child.computed &&
      child.object.type === "Identifier" &&
      bindings.queryObjectNames.has(child.object.name) &&
      child.property.type === "Identifier" &&
      child.property.name === "data"
    ) {
      found = true;
    }
  });

  return found;
}

function collectBindingNames(
  node: TSESTree.Node,
  names: Set<string>,
): void {
  if (node.type === "Identifier") {
    names.add(node.name);
    return;
  }

  if (node.type === "AssignmentPattern") {
    collectBindingNames(node.left, names);
  }
}

function getPropertyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (
    node.type === "Literal" &&
    typeof node.value === "string"
  ) {
    return node.value;
  }

  return undefined;
}

function getCallName(
  node: TSESTree.CallExpression,
): string | undefined {
  if (node.callee.type === "Identifier") {
    return node.callee.name;
  }

  if (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier"
  ) {
    return node.callee.property.name;
  }

  return undefined;
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
    title: "React Query data mirrored into local state",
    message:
      "This effect only copies React Query data into component state, creating a second source of truth and an extra render/synchronization step.",
    severity: "medium",
    source: "ast",
    location: {
      file,
      line: node.loc?.start.line ?? 1,
      column: node.loc?.start.column ?? 0,
    },
    suggestion:
      "Read or derive the value directly from the query result unless local state intentionally diverges through user edits.",
    confidence: 0.97,
  };
}
