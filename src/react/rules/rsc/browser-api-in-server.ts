import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  analyzeRscModule,
  getRootIdentifier,
  isExplicitServerModule,
} from "./semantic";

const RULE_ID = "react.rsc.browser-api-in-server";
const BROWSER_GLOBALS = new Set([
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
]);

export const reactRscBrowserApiInServerRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect browser-only globals used in modules with an explicit server boundary.",

  check(node, context) {
    if (
      node.type !== "MemberExpression" ||
      node.object.type !== "Identifier" ||
      !isExplicitServerModule(context)
    ) {
      return [];
    }

    const analysis = analyzeRscModule(context);
    const rootName = getRootIdentifier(node.object);

    if (
      rootName === undefined ||
      !BROWSER_GLOBALS.has(rootName) ||
      analysis.boundNames.has(rootName)
    ) {
      return [];
    }

    return [createFinding(context.file, node, rootName)];
  },
};

function createFinding(
  file: string,
  node: TSESTree.MemberExpression,
  globalName: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Browser API used in server module",
    message:
      `${globalName} is a browser runtime global, but this module has an explicit React server boundary and cannot rely on browser-only state during server execution.`,
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Move browser access into a \"use client\" component or pass the required serializable value through the server/client boundary.",
    confidence: 0.98,
  };
}
