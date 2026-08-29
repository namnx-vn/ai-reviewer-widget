import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import { collectStateBindings, getRootIdentifier } from "./semantic";

const RULE_ID = "react.state.mutation";
const MUTATING_METHODS = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

export const reactStateMutationRule: ReactRule = {
  id: RULE_ID,
  description: "Detect direct mutation of values owned by React useState.",

  check(node, context): ReviewFinding[] {
    const stateNames = new Set(
      collectStateBindings(context.ast).map((binding) => binding.stateName),
    );

    const mutatedState = getMutatedStateName(node, stateNames);

    if (mutatedState === undefined) {
      return [];
    }

    return [createFinding(node, context.file, mutatedState)];
  },
};

function getMutatedStateName(
  node: TSESTree.Node,
  stateNames: ReadonlySet<string>,
): string | undefined {
  if (node.type === "AssignmentExpression") {
    const root = getRootIdentifier(node.left);
    return root !== undefined && stateNames.has(root) ? root : undefined;
  }

  if (node.type === "UpdateExpression") {
    const root = getRootIdentifier(node.argument);
    return root !== undefined && stateNames.has(root) ? root : undefined;
  }

  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    MUTATING_METHODS.has(node.callee.property.name)
  ) {
    const root = getRootIdentifier(node.callee.object);
    return root !== undefined && stateNames.has(root) ? root : undefined;
  }

  return undefined;
}

function createFinding(
  node: TSESTree.Node,
  file: string,
  stateName: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Direct state mutation",
    message: `${stateName} is mutated directly. React state must be treated as immutable.`,
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Create a new object or array and update it through the corresponding state setter.",
    confidence: 0.99,
  };
}
