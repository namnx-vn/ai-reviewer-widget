import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  getCallName,
  getReturnedExpression,
  isRenderPhaseNode,
  isTrivialExpression,
} from "./semantic";

const RULE_ID = "react.performance.trivial-use-memo";

export const reactPerformanceTrivialUseMemoRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect useMemo calls that wrap expressions with no calls, allocations, or collection work.",

  check(node, context): ReviewFinding[] {
    if (
      node.type !== "CallExpression" ||
      getCallName(node) !== "useMemo" ||
      !isRenderPhaseNode(node, context)
    ) {
      return [];
    }

    const callback = node.arguments[0];

    if (
      callback?.type !== "ArrowFunctionExpression" &&
      callback?.type !== "FunctionExpression"
    ) {
      return [];
    }

    const expression = getReturnedExpression(callback);

    if (expression === undefined || !isTrivialExpression(expression)) {
      return [];
    }

    return [createFinding(node, context.file)];
  },
};

function createFinding(
  node: TSESTree.CallExpression,
  file: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Trivial useMemo",
    message:
      "This useMemo callback returns a trivial expression with no function calls, allocations, or collection traversal. " +
      "The memoization bookkeeping is unlikely to provide value for this expression.",
    severity: "low",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Compute the expression directly during render. Reserve useMemo for computations whose measured or structurally evident cost justifies caching.",
    confidence: 0.94,
  };
}
