import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import { isReactComponentClass } from "./library-context";

const RULE_ID = "react.patterns.ineffective-error-boundary";

export const reactPatternsIneffectiveErrorBoundaryRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect React error boundaries that have no statically visible recovery state transition.",

  check(node, context) {
    if (
      node.type !== "ClassDeclaration" &&
      node.type !== "ClassExpression"
    ) {
      return [];
    }

    if (
      !isReactComponentClass(node, context) ||
      !isErrorBoundary(node) ||
      hasRecoveryTransition(node)
    ) {
      return [];
    }

    return [createFinding(context.file, node)];
  },
};

function isErrorBoundary(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): boolean {
  return (
    getMethod(node, "componentDidCatch", false) !== undefined ||
    getMethod(node, "getDerivedStateFromError", true) !== undefined
  );
}

function hasRecoveryTransition(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): boolean {
  const derivedState = getMethod(
    node,
    "getDerivedStateFromError",
    true,
  );

  if (
    derivedState?.value.body !== null &&
    derivedState?.value.body !== undefined &&
    hasNonNullReturn(derivedState.value.body)
  ) {
    return true;
  }

  const didCatch = getMethod(
    node,
    "componentDidCatch",
    false,
  );

  return (
    didCatch?.value.body !== null &&
    didCatch?.value.body !== undefined &&
    containsThisSetState(didCatch.value.body)
  );
}

function getMethod(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  name: string,
  isStatic: boolean,
): TSESTree.MethodDefinition | undefined {
  for (const element of node.body.body) {
    if (
      element.type !== "MethodDefinition" ||
      element.static !== isStatic ||
      getPropertyName(element.key) !== name
    ) {
      continue;
    }

    return element;
  }

  return undefined;
}

function hasNonNullReturn(
  body: TSESTree.BlockStatement,
): boolean {
  let found = false;

  visitWithoutNestedFunctions(body, (node) => {
    if (
      node.type !== "ReturnStatement" ||
      node.argument === null
    ) {
      return;
    }

    if (
      node.argument.type === "Literal" &&
      node.argument.value === null
    ) {
      return;
    }

    found = true;
  });

  return found;
}

function containsThisSetState(
  body: TSESTree.BlockStatement,
): boolean {
  let found = false;

  visitWithoutNestedFunctions(body, (node) => {
    if (
      node.type !== "CallExpression" ||
      node.callee.type !== "MemberExpression" ||
      node.callee.computed ||
      node.callee.object.type !== "ThisExpression" ||
      node.callee.property.type !== "Identifier" ||
      node.callee.property.name !== "setState"
    ) {
      return;
    }

    found = true;
  });

  return found;
}

function visitWithoutNestedFunctions(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    if (
      child.type === "FunctionDeclaration" ||
      child.type === "FunctionExpression" ||
      child.type === "ArrowFunctionExpression"
    ) {
      continue;
    }

    visitWithoutNestedFunctions(child, callback);
  }
}

function getChildNodes(
  node: TSESTree.Node,
): readonly TSESTree.Node[] {
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

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function getPropertyName(
  node: TSESTree.Node,
): string | undefined {
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

function createFinding(
  file: string,
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): ReviewFinding {
  return {
    id: [
      RULE_ID,
      file,
      node.loc?.start.line ?? 1,
      node.loc?.start.column ?? 0,
    ].join(":"),
    ruleId: RULE_ID,
    title: "Error boundary has no recovery state",
    message:
      "This class is an error boundary, but its static error handler does not return recovery state and componentDidCatch does not update component state, so no local fallback transition is statically visible.",
    severity: "medium",
    source: "ast",
    location: {
      file,
      line: node.loc?.start.line ?? 1,
      column: node.loc?.start.column ?? 0,
    },
    suggestion:
      "Return fallback state from getDerivedStateFromError, or update boundary state in componentDidCatch and render a fallback UI.",
    confidence: 0.94,
  };
}
