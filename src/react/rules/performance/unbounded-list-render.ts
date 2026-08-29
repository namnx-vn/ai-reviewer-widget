import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  callbackReturnsJsx,
  findEnclosingComponent,
  getCallChainRoot,
  getMemberCallName,
  isDynamicComponentInput,
  isRenderPhaseNode,
  isStaticallyBoundedCollection,
} from "./semantic";

const RULE_ID = "react.performance.unbounded-list-render";

export const reactPerformanceUnboundedListRenderRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect JSX list rendering that consumes an entire dynamic collection without a statically visible bound.",

  check(node, context): ReviewFinding[] {
    if (
      node.type !== "CallExpression" ||
      getMemberCallName(node) !== "map" ||
      !isRenderPhaseNode(node, context) ||
      node.callee.type !== "MemberExpression"
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

    if (!callbackReturnsJsx(callback)) {
      return [];
    }

    const component = findEnclosingComponent(node, context);
    const collection = node.callee.object;

    if (
      component === undefined ||
      !isDynamicComponentInput(getCallChainRoot(node), component) ||
      isStaticallyBoundedCollection(collection)
    ) {
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
    title: "Unbounded list rendering",
    message:
      "This render maps an entire dynamic collection to JSX without a statically visible bound. " +
      "Static analysis cannot know the collection size, so this is reported as a scaling risk rather than a measured slowdown.",
    severity: "low",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "If this collection can grow large, add pagination/windowing/virtualization or otherwise bound the number of rendered rows. Keep the direct map when the collection is intentionally small.",
    confidence: 0.82,
  };
}
