import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import { isExplicitServerModule } from "./semantic";

const RULE_ID = "react.rsc.event-handler-in-server";
const EVENT_HANDLER_NAME = /^on[A-Z]/u;

export const reactRscEventHandlerInServerRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect intrinsic DOM event handlers rendered by modules with an explicit server boundary.",

  check(node, context) {
    if (
      node.type !== "JSXOpeningElement" ||
      node.name.type !== "JSXIdentifier" ||
      !startsLowerCase(node.name.name) ||
      !isExplicitServerModule(context)
    ) {
      return [];
    }

    const findings: ReviewFinding[] = [];

    for (const attribute of node.attributes) {
      if (
        attribute.type !== "JSXAttribute" ||
        attribute.name.type !== "JSXIdentifier" ||
        !EVENT_HANDLER_NAME.test(attribute.name.name) ||
        attribute.value?.type !== "JSXExpressionContainer" ||
        attribute.value.expression.type === "JSXEmptyExpression"
      ) {
        continue;
      }

      findings.push(
        createFinding(
          context.file,
          attribute,
          node.name.name,
          attribute.name.name,
        ),
      );
    }

    return findings;
  },
};

function startsLowerCase(value: string): boolean {
  const first = value[0];
  return first !== undefined && first === first.toLowerCase();
}

function createFinding(
  file: string,
  node: TSESTree.JSXAttribute,
  elementName: string,
  eventName: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "DOM event handler in server component boundary",
    message:
      `${eventName} is attached directly to <${elementName}> in a module with an explicit server boundary. Server-rendered intrinsic elements cannot carry executable client event handlers across the RSC payload.`,
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Move the interactive element into a \"use client\" component and pass only serializable data or server-function references into it.",
    confidence: 0.99,
  };
}
