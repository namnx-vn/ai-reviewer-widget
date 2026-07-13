import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  getFunctionName,
  getFunctionUseServerDirective,
  isFunctionNode,
} from "./semantic";

const RULE_ID = "react.rsc.server-function-async";

export const reactRscServerFunctionAsyncRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect function-level use server directives on non-async functions.",

  check(node, context) {
    if (
      !isFunctionNode(node) ||
      getFunctionUseServerDirective(node) === undefined ||
      node.async
    ) {
      return [];
    }

    const line = node.loc?.start.line ?? 1;
    const column = node.loc?.start.column ?? 0;
    const functionName = getFunctionName(node);

    return [
      {
        id: [RULE_ID, context.file, line, column].join(":"),
        ruleId: RULE_ID,
        title: "Server Function must be async",
        message:
          `${functionName} contains a function-level \"use server\" directive but is not async. React Server Functions cross an asynchronous server boundary and must use an async function contract.`,
        severity: "high",
        source: "ast",
        location: { file: context.file, line, column },
        suggestion:
          `Declare ${functionName} as async and return only values supported by the React Server Function serialization contract.`,
        confidence: 0.99,
      } satisfies ReviewFinding,
    ];
  },
};
