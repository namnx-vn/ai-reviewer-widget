import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  countCollectionPasses,
  findEnclosingComponent,
  getCallChainMethods,
  getCallChainRoot,
  isDynamicComponentInput,
  isOutermostMemberCall,
  isRenderPhaseNode,
} from "./semantic";

const RULE_ID = "react.performance.expensive-render-work";
const SORT_METHODS = new Set(["sort", "toSorted"]);

export const reactPerformanceExpensiveRenderWorkRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect statically evident collection work that scales poorly when repeated during component render.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression" || !isRenderPhaseNode(node, context)) {
      return [];
    }

    const component = findEnclosingComponent(node, context);

    if (
      component === undefined ||
      !isOutermostMemberCall(node, component) ||
      !isDynamicComponentInput(getCallChainRoot(node), component)
    ) {
      return [];
    }

    const methods = getCallChainMethods(node);
    const collectionPasses = countCollectionPasses(node);
    const sortMethod = methods.find((method) => SORT_METHODS.has(method));

    if (sortMethod === undefined && collectionPasses < 3) {
      return [];
    }

    return [
      createFinding(
        node,
        context.file,
        sortMethod !== undefined
          ? `The render path performs ${sortMethod}() on a dynamic collection.`
          : `The render path performs ${collectionPasses} collection passes in one derived expression.`,
        sortMethod !== undefined ? 0.91 : 0.84,
      ),
    ];
  },
};

function createFinding(
  node: TSESTree.CallExpression,
  file: string,
  evidence: string,
  confidence: number,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Expensive render-time collection work",
    message:
      `${evidence} Static analysis cannot measure the runtime cost, ` +
      "but this work scales with collection size and repeats whenever the component renders.",
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Compute the derived collection once per relevant input change. Consider useMemo only when the collection size or computation cost justifies memoization.",
    confidence,
  };
}
