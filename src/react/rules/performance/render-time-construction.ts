import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import { isRenderPhaseNode } from "./semantic";

const RULE_ID = "react.performance.render-time-construction";
const INTL_CONSTRUCTORS = new Set([
  "Collator",
  "DateTimeFormat",
  "DisplayNames",
  "ListFormat",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter",
]);

export const reactPerformanceRenderTimeConstructionRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect formatter or regular-expression construction repeated directly in component render.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "NewExpression" || !isRenderPhaseNode(node, context)) {
      return [];
    }

    const constructor = getConstructorKind(node);

    if (constructor === undefined) {
      return [];
    }

    if (constructor === "RegExp" && !hasOnlyLiteralArguments(node)) {
      return [];
    }

    return [createFinding(node, context.file, constructor)];
  },
};

function getConstructorKind(
  node: TSESTree.NewExpression,
): string | undefined {
  if (
    node.callee.type === "Identifier" &&
    node.callee.name === "RegExp"
  ) {
    return "RegExp";
  }

  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.object.type !== "Identifier" ||
    node.callee.object.name !== "Intl" ||
    node.callee.property.type !== "Identifier" ||
    !INTL_CONSTRUCTORS.has(node.callee.property.name)
  ) {
    return undefined;
  }

  return `Intl.${node.callee.property.name}`;
}

function hasOnlyLiteralArguments(
  node: TSESTree.NewExpression,
): boolean {
  return node.arguments.every(
    (argument) => argument.type === "Literal",
  );
}

function createFinding(
  node: TSESTree.NewExpression,
  file: string,
  constructor: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Avoidable render-time construction",
    message:
      `${constructor} is constructed directly during component render, so a new instance is created on each render. ` +
      "This finding identifies repeated allocation/construction, not a measured runtime regression.",
    severity: "low",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Hoist the instance outside the component when its configuration is static. If its configuration depends on props or state, consider memoizing the instance by those inputs when profiling shows the construction matters.",
    confidence: constructor === "RegExp" ? 0.88 : 0.9,
  };
}
