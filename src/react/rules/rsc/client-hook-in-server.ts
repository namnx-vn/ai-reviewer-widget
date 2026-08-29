import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  analyzeRscModule,
  getReactCallName,
  isExplicitServerModule,
} from "./semantic";

const RULE_ID = "react.rsc.client-hook-in-server";
const CLIENT_ONLY_HOOKS = new Set([
  "useState",
  "useReducer",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useRef",
  "useImperativeHandle",
  "useSyncExternalStore",
  "useTransition",
  "useDeferredValue",
]);

export const reactRscClientHookInServerRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect React client-only hooks inside modules with an explicit server boundary.",

  check(node, context) {
    if (node.type !== "CallExpression" || !isExplicitServerModule(context)) {
      return [];
    }

    const hookName = getReactCallName(node, analyzeRscModule(context));

    if (hookName === undefined || !CLIENT_ONLY_HOOKS.has(hookName)) {
      return [];
    }

    return [createFinding(context.file, node, hookName)];
  },
};

function createFinding(
  file: string,
  node: TSESTree.CallExpression,
  hookName: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Client-only React hook in server module",
    message:
      `${hookName} is imported from React and called in a module with an explicit server boundary. This hook requires client-side React state, effects, or mutable runtime behavior that Server Components do not provide.`,
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Move the interactive logic into a \"use client\" component and pass serializable data from the server boundary into that client component.",
    confidence: 0.99,
  };
}
