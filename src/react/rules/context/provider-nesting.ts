import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  analyzeContextUsage,
  findProviderForNode,
  getProviderAncestors,
  getProviderValueSignature,
} from "./semantic";

const RULE_ID = "react.context.provider-nesting";
const DEEP_PROVIDER_THRESHOLD = 5;

export const reactContextProviderNestingRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect statically duplicated context providers and unusually deep provider composition.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "JSXElement") {
      return [];
    }

    const provider = findProviderForNode(node, context);

    if (provider === undefined) {
      return [];
    }

    const ancestors = getProviderAncestors(provider, context);
    const findings: ReviewFinding[] = [];
    const signature = getProviderValueSignature(provider, context.source);

    if (signature !== undefined) {
      const duplicate = ancestors.find(
        (ancestor) =>
          ancestor.contextName === provider.contextName &&
          getProviderValueSignature(ancestor, context.source) === signature,
      );

      if (duplicate !== undefined) {
        findings.push(
          createDuplicateFinding(
            provider.contextName,
            node,
            context.file,
          ),
        );
      }
    }

    const depth = ancestors.length + 1;

    if (depth === DEEP_PROVIDER_THRESHOLD) {
      findings.push(
        createDeepNestingFinding(
          analyzeContextUsage(context).providers.length,
          depth,
          node,
          context.file,
        ),
      );
    }

    return findings;
  },
};

function createDuplicateFinding(
  contextName: string,
  node: TSESTree.JSXElement,
  file: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, "duplicate", file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Duplicated context provider",
    message:
      `${contextName}.Provider is nested inside another ${contextName}.Provider with the same statically visible value expression. ` +
      "The inner provider does not establish a distinct value boundary.",
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Remove the duplicated provider or give the inner provider an intentionally distinct value when it is meant to override context for this subtree.",
    confidence: 0.95,
  };
}

function createDeepNestingFinding(
  providerCount: number,
  depth: number,
  node: TSESTree.JSXElement,
  file: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, "depth", file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Deep context provider composition",
    message:
      `This subtree reaches ${depth} nested context providers (${providerCount} providers are declared in the file). ` +
      "The nesting is statically visible and may indicate provider responsibilities that have become tightly coupled.",
    severity: "low",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Review whether adjacent providers can be composed behind a focused boundary or whether some context responsibilities should be separated closer to their consumers.",
    confidence: 0.82,
  };
}
