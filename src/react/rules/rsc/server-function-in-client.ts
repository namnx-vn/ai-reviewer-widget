import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  getFunctionName,
  getFunctionUseServerDirective,
  isExplicitClientModule,
  isFunctionNode,
} from "./semantic";

const RULE_ID = "react.rsc.server-function-in-client";

export const reactRscServerFunctionInClientRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect inline Server Functions declared inside explicit client modules.",

  check(node, context) {
    if (
      !isFunctionNode(node) ||
      !isExplicitClientModule(context) ||
      getFunctionUseServerDirective(node) === undefined
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
        title: "Server Function declared inside client module",
        message:
          `${functionName} declares "use server" inside a module with an explicit client boundary. Server Functions must be defined on the server side and imported into client code rather than created inside the client module.`,
        severity: "high",
        source: "ast",
        location: { file: context.file, line, column },
        suggestion:
          `Move ${functionName} into a server module, export it there, and import that server-function reference into the client component.`,
        confidence: 0.98,
      } satisfies ReviewFinding,
    ];
  },
};
