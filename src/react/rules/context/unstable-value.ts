import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  analyzeProviderValue,
  findProviderForNode,
  type ContextValueKind,
} from "./semantic";

const RULE_ID = "react.context.unstable-value";

export const reactContextUnstableValueRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect Context.Provider values whose object, array, or function identity is recreated during provider render.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "JSXElement") {
      return [];
    }

    const provider = findProviderForNode(node, context);

    if (provider === undefined) {
      return [];
    }

    const analysis = analyzeProviderValue(provider);

    if (!isUnstableKind(analysis.kind)) {
      return [];
    }

    return [
      createFinding(
        provider.contextName,
        analysis.kind,
        node,
        context.file,
      ),
    ];
  },
};

function isUnstableKind(
  kind: ContextValueKind,
): kind is
  | "unstable-object"
  | "unstable-array"
  | "unstable-function" {
  return (
    kind === "unstable-object" ||
    kind === "unstable-array" ||
    kind === "unstable-function"
  );
}

function createFinding(
  contextName: string,
  kind:
    | "unstable-object"
    | "unstable-array"
    | "unstable-function",
  node: TSESTree.JSXElement,
  file: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;
  const valueDescription =
    kind === "unstable-function"
      ? "function"
      : kind === "unstable-array"
        ? "array"
        : "object";

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Unstable context provider value",
    message:
      `${contextName}.Provider receives a ${valueDescription} value whose identity is recreated during provider render. ` +
      "React Context compares provider values by identity, so this can invalidate consumers even when the logical contents are unchanged.",
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      kind === "unstable-function"
        ? "Pass a stable callback, such as a useCallback result, when function identity is intended to remain stable between renders."
        : "Stabilize the provider value with useMemo when identity should only change with its actual dependencies, or pass a naturally stable value directly.",
    confidence: 0.97,
  };
}
