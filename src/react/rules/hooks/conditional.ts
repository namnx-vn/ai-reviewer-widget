import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import type { SemanticHookMetadata } from "../../semantic/hook-context";

export const reactHooksConditionalRule: ReactRule = {
  id: "react.hooks.conditional",

  description:
    "Detect React Hooks that execute conditionally, inside loops, or after an early return.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    const hook = findHook(node, context.hooks.hooks);

    if (hook === undefined) {
      return [];
    }

    if (hook.execution.isConditional || hook.execution.isLoop) {
      return [createFinding(hook, context.file)];
    }

    return [];
  },
};

function findHook(
  node: TSESTree.CallExpression,
  hooks: readonly SemanticHookMetadata[],
): SemanticHookMetadata | undefined {
  return hooks.find((item) => item.hook.node === node);
}

function inspectStatements(
  statements: readonly TSESTree.Statement[],
  hook: TSESTree.CallExpression,
): boolean {
  for (const statement of statements) {
    if (containsNode(statement, hook)) {
      return inspectStatementPath(statement, hook);
    }

    if (statement.type === "ReturnStatement") {
      return true;
    }

    if (hasReachableReturnBeforeHook(statement, hook)) {
      return true;
    }
  }

  return false;
}

function inspectStatementPath(
  statement: TSESTree.Statement,
  hook: TSESTree.CallExpression,
): boolean {
  if (statement.type === "BlockStatement") {
    return inspectStatements(statement.body, hook);
  }

  if (statement.type === "IfStatement") {
    if (containsNode(statement.consequent, hook)) {
      return containsReturnInPathBeforeHook(statement.consequent, hook);
    }

    if (
      statement.alternate !== null &&
      containsNode(statement.alternate, hook)
    ) {
      return containsReturnInPathBeforeHook(statement.alternate, hook);
    }

    return false;
  }

  if (statement.type === "TryStatement") {
    if (containsNode(statement.block, hook)) {
      return inspectStatements(statement.block.body, hook);
    }

    if (
      statement.handler !== null &&
      containsNode(statement.handler.body, hook)
    ) {
      return inspectStatements(statement.handler.body.body, hook);
    }

    if (
      statement.finalizer !== null &&
      containsNode(statement.finalizer, hook)
    ) {
      return inspectStatements(statement.finalizer.body, hook);
    }
  }

  return false;
}

function containsReturnInPathBeforeHook(
  node: TSESTree.Node,
  hook: TSESTree.CallExpression,
): boolean {
  if (node.type === "BlockStatement") {
    return inspectStatements(node.body, hook);
  }

  if (node.type === "IfStatement") {
    if (containsNode(node.consequent, hook)) {
      return containsReturnInPathBeforeHook(node.consequent, hook);
    }

    if (node.alternate !== null && containsNode(node.alternate, hook)) {
      return containsReturnInPathBeforeHook(node.alternate, hook);
    }
  }

  return node.type === "ReturnStatement";
}

function hasReachableReturnBeforeHook(
  statement: TSESTree.Statement,
  hook: TSESTree.CallExpression,
): boolean {
  if (!containsNode(statement, hook)) {
    return false;
  }

  return inspectStatementPath(statement, hook);
}

function createFinding(
  hook: SemanticHookMetadata,
  file: string,
): ReviewFinding {
  return {
    id: [
      "react.hooks.conditional",
      file,
      hook.hook.location.line,
      hook.hook.location.column,
    ].join(":"),
    ruleId: "react.hooks.conditional",
    title: "Conditional Hook execution",
    message:
      `${hook.hook.name} must execute unconditionally on every render. ` +
      "Move the Hook to the top level of the component or custom Hook.",
    severity: "high",
    source: "ast",
    location: {
      file,
      line: hook.hook.location.line,
      column: hook.hook.location.column,
    },
    suggestion:
      "Call the Hook before conditional branches, loops, and early returns.",
    confidence: 1,
  };
}

function containsNode(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  const parentStart = parent.range?.[0];
  const parentEnd = parent.range?.[1];
  const childStart = child.range?.[0];
  const childEnd = child.range?.[1];

  if (
    parentStart === undefined ||
    parentEnd === undefined ||
    childStart === undefined ||
    childEnd === undefined
  ) {
    return false;
  }

  return parentStart <= childStart && childEnd <= parentEnd;
}
