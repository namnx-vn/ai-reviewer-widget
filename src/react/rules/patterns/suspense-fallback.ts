import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { visit } from "../../ast/component-utils";
import {
  getJSXAttribute,
  getJSXExpression,
  getJSXName,
} from "../../ast/jsx-utils";
import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  collectLazyComponentNames,
  isSuspenseElement,
} from "./library-context";

const RULE_ID = "react.patterns.suspense-fallback";

export const reactPatternsSuspenseFallbackRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect Suspense fallbacks that statically render another React.lazy component.",

  check(node, context) {
    if (
      node.type !== "JSXElement" ||
      !isSuspenseElement(node, context)
    ) {
      return [];
    }

    const fallbackAttribute = getJSXAttribute(
      node.openingElement,
      "fallback",
    );

    if (fallbackAttribute === undefined) {
      return [];
    }

    const fallback = getJSXExpression(fallbackAttribute);

    if (
      fallback === undefined ||
      fallback === null ||
      !containsLazyFallback(
        fallback,
        collectLazyComponentNames(context),
      )
    ) {
      return [];
    }

    return [createFinding(context.file, node)];
  },
};

function containsLazyFallback(
  expression: TSESTree.Expression,
  lazyComponents: ReadonlySet<string>,
): boolean {
  let found = false;

  visit(expression, (node) => {
    if (found || node.type !== "JSXElement") {
      return;
    }

    const name = getJSXName(node.openingElement.name);

    if (
      name !== undefined &&
      lazyComponents.has(name)
    ) {
      found = true;
    }
  });

  return found;
}

function createFinding(
  file: string,
  node: TSESTree.JSXElement,
): ReviewFinding {
  return {
    id: [
      RULE_ID,
      file,
      node.loc?.start.line ?? 1,
      node.loc?.start.column ?? 0,
    ].join(":"),
    ruleId: RULE_ID,
    title: "Suspense fallback can suspend",
    message:
      "This Suspense fallback renders a component created with React.lazy, so the fallback itself can suspend instead of providing an immediately available loading UI.",
    severity: "medium",
    source: "ast",
    location: {
      file,
      line: node.loc?.start.line ?? 1,
      column: node.loc?.start.column ?? 0,
    },
    suggestion:
      "Use a synchronously available fallback, or wrap the lazy fallback in a separate outer Suspense boundary with a synchronous fallback.",
    confidence: 0.98,
  };
}
