import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";

const RULE_ID = "react.rendering.unnecessary-rerender";
const STATE_SETTER_PATTERN = /^set[A-Z0-9]/u;

export const reactRenderingUnnecessaryRerenderRule: ReactRule = {
  id: RULE_ID,

  description:
    "Detect state updates executed during React component render.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    if (
      node.callee.type !== "Identifier" ||
      !STATE_SETTER_PATTERN.test(node.callee.name)
    ) {
      return [];
    }

    const component = findComponentContainingNode(
      node,
      context.ast,
    );

    if (component === undefined) {
      return [];
    }

    if (hasNestedFunctionBoundary(component, node)) {
      return [];
    }

    return [
      createFinding(
        node,
        context.file,
      ),
    ];
  },
};

function findComponentContainingNode(
  target: TSESTree.Node,
  ast: TSESTree.Program,
):
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | undefined {
  let result:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
    | undefined;

  visit(ast, (node) => {
    if (
      result !== undefined ||
      !isComponentFunction(node) ||
      !containsNode(node, target)
    ) {
      return;
    }

    result = node;
  });

  return result;
}

function isComponentFunction(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression {
  if (
    node.type !== "FunctionDeclaration" &&
    node.type !== "FunctionExpression" &&
    node.type !== "ArrowFunctionExpression"
  ) {
    return false;
  }

  const name = getFunctionName(node);

  return (
    name !== undefined &&
    /^[A-Z]/u.test(name)
  );
}

function getFunctionName(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string | undefined {
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  ) {
    return node.id?.name;
  }

  return undefined;
}

function hasNestedFunctionBoundary(
  component:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  target: TSESTree.Node,
): boolean {
  let found = false;

  visit(component.body, (node) => {
    if (
      node === component.body ||
      !containsNode(node, target)
    ) {
      return;
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      found = true;
    }
  });

  return found;
}

function createFinding(
  node: TSESTree.CallExpression,
  file: string,
): ReviewFinding {
  const setterName =
    node.callee.type === "Identifier"
      ? node.callee.name
      : "state setter";

  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [
      RULE_ID,
      file,
      line,
      column,
    ].join(":"),

    ruleId: RULE_ID,

    title: "State update during render",

    message:
      `${setterName} is called during component render. ` +
      "This can cause an unnecessary re-render or an infinite render loop.",

    severity: "high",

    source: "ast",

    location: {
      file,
      line,
      column,
    },

    suggestion:
      "Move the state update to an event handler or effect. " +
      "If the value is derived from existing render inputs, derive it " +
      "directly during render instead.",

    confidence: 0.96,
  };
}

function containsNode(
  parent: TSESTree.Node,
  target: TSESTree.Node,
): boolean {
  if (parent === target) {
    return true;
  }

  for (const child of getChildNodes(parent)) {
    if (containsNode(child, target)) {
      return true;
    }
  }

  return false;
}

function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

function getChildNodes(
  node: TSESTree.Node,
): TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        children.push(item);
      }
    }
  }

  return children;
}

function isNode(
  value: unknown,
): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

