import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  findEnclosingComponent,
  getCallChainRoot,
  getMemberCallName,
  getNormalizedSource,
  isDynamicComponentInput,
  isOutermostMemberCall,
  isRenderPhaseNode,
  visit,
} from "./semantic";

const RULE_ID = "react.performance.repeated-derived-computation";
const DERIVED_METHODS = new Set([
  "filter",
  "flatMap",
  "map",
  "reduce",
  "reduceRight",
  "sort",
  "toSorted",
]);

export const reactPerformanceRepeatedDerivedComputationRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect identical dynamic collection derivations repeated during the same component render.",

  check(node, context): ReviewFinding[] {
    if (
      node.type !== "CallExpression" ||
      !DERIVED_METHODS.has(getMemberCallName(node) ?? "") ||
      !isRenderPhaseNode(node, context)
    ) {
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

    const signature = getNormalizedSource(node, context.source);

    if (signature === undefined) {
      return [];
    }

    const matches: TSESTree.CallExpression[] = [];

    visit(component.node, (candidate) => {
      if (
        candidate.type !== "CallExpression" ||
        !DERIVED_METHODS.has(getMemberCallName(candidate) ?? "") ||
        !isRenderPhaseNode(candidate, context) ||
        !isOutermostMemberCall(candidate, component) ||
        !isDynamicComponentInput(getCallChainRoot(candidate), component)
      ) {
        return;
      }

      if (getNormalizedSource(candidate, context.source) === signature) {
        matches.push(candidate);
      }
    });

    if (matches.length < 2 || matches[0] !== node) {
      return [];
    }

    return [createFinding(node, context.file, matches.length)];
  },
};

function createFinding(
  node: TSESTree.CallExpression,
  file: string,
  occurrences: number,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Repeated derived computation",
    message:
      `The same dynamic collection derivation appears ${occurrences} times in the same render path. ` +
      "That repeats structurally identical work for each render.",
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Compute the derived value once and reuse it. Add useMemo only when the collection size or measured cost makes caching worthwhile.",
    confidence: 0.96,
  };
}
