import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  analyzeProviderValue,
  collectProviderDynamicRoots,
  countObjectProperties,
  findProviderForNode,
} from "./semantic";

const RULE_ID = "react.context.consumer-invalidation";
const MIN_DYNAMIC_ROOTS = 3;
const MIN_VALUE_FIELDS = 3;

export const reactContextConsumerInvalidationRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect broad memoized context values that combine several independently changing render inputs and can invalidate unrelated consumers together.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "JSXElement") {
      return [];
    }

    const provider = findProviderForNode(node, context);

    if (provider === undefined) {
      return [];
    }

    const analysis = analyzeProviderValue(provider);
    const objectExpression = analysis.objectExpression;

    if (
      analysis.kind !== "memoized-object" ||
      objectExpression === undefined ||
      countObjectProperties(objectExpression) < MIN_VALUE_FIELDS
    ) {
      return [];
    }

    const dynamicRoots = collectProviderDynamicRoots(provider);

    if (dynamicRoots.length < MIN_DYNAMIC_ROOTS) {
      return [];
    }

    return [
      createFinding(
        provider.contextName,
        dynamicRoots,
        node,
        context.file,
      ),
    ];
  },
};

function createFinding(
  contextName: string,
  dynamicRoots: readonly string[],
  node: TSESTree.JSXElement,
  file: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;
  const inputs = dynamicRoots.slice(0, 4).join(", ");

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Broad context invalidation boundary",
    message:
      `${contextName}.Provider combines ${dynamicRoots.length} independently changing render inputs (${inputs}) in one memoized object. ` +
      "Whenever any one of them changes, every consumer of this context observes a new provider value, including consumers that may only need another field.",
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Consider splitting this context by update cadence or responsibility so consumers can subscribe to a narrower provider value.",
    confidence: 0.86,
  };
}
