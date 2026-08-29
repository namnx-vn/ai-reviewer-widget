import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  getFunctionName,
  getFunctionUseServerDirective,
  isFunctionNode,
  visitFunctionBody,
} from "./semantic";

const RULE_ID = "react.rsc.non-serializable-server-return";

export const reactRscNonSerializableServerReturnRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect definitely non-serializable return values from function-level React Server Functions.",

  check(node, context) {
    if (
      !isFunctionNode(node) ||
      getFunctionUseServerDirective(node) === undefined
    ) {
      return [];
    }

    let invalidReturn: TSESTree.ReturnStatement | undefined;

    visitFunctionBody(node.body, (child) => {
      if (
        invalidReturn === undefined &&
        child.type === "ReturnStatement" &&
        child.argument !== null &&
        isDefinitelyNonSerializable(child.argument)
      ) {
        invalidReturn = child;
      }
    });

    if (invalidReturn === undefined) {
      return [];
    }

    const line = invalidReturn.loc?.start.line ?? 1;
    const column = invalidReturn.loc?.start.column ?? 0;
    const functionName = getFunctionName(node);

    return [
      {
        id: [RULE_ID, context.file, line, column].join(":"),
        ruleId: RULE_ID,
        title: "Non-serializable Server Function return",
        message:
          `${functionName} returns a value that is statically known not to satisfy the React Server Function serialization boundary.`,
        severity: "high",
        source: "ast",
        location: { file: context.file, line, column },
        suggestion:
          "Return serializable data instead. Keep executable closures, classes, WeakMap, WeakSet, and non-global Symbols on one side of the server/client boundary.",
        confidence: 0.97,
      } satisfies ReviewFinding,
    ];
  },
};

function isDefinitelyNonSerializable(node: TSESTree.Node): boolean {
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "ClassExpression"
  ) {
    return true;
  }

  if (
    node.type === "NewExpression" &&
    node.callee.type === "Identifier" &&
    (node.callee.name === "WeakMap" || node.callee.name === "WeakSet")
  ) {
    return true;
  }

  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "Symbol"
  );
}
