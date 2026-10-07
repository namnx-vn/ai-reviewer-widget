import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  collectReactImports,
  getChildNodes,
  isFunctionNode,
  isReactApiCall,
  supportsReact19,
} from "./semantic";

const RULE_ID = "react.react19.use-in-try-catch";

export const react19UseInTryCatchRule: ReactRule = {
  id: RULE_ID,
  description: "Detect React use() calls guarded by try/catch.",
  rollout: "advisory",

  check(node, context): ReviewFinding[] {
    if (node.type !== "Program" || !supportsReact19(context.framework)) {
      return [];
    }

    const imports = collectReactImports(node);
    const guardedCalls: TSESTree.CallExpression[] = [];

    visitGuardedCalls(node, 0, imports, guardedCalls, true);

    return guardedCalls.map((call) => createFinding(call, context.file));
  },
};

function visitGuardedCalls(
  node: TSESTree.Node,
  tryDepth: number,
  imports: ReturnType<typeof collectReactImports>,
  output: TSESTree.CallExpression[],
  isRoot = false,
): void {
  if (!isRoot && isFunctionNode(node)) {
    for (const parameter of node.params) {
      visitGuardedCalls(parameter, 0, imports, output);
    }
    visitGuardedCalls(node.body, 0, imports, output);
    return;
  }

  if (node.type === "TryStatement") {
    visitGuardedCalls(node.block, tryDepth + 1, imports, output);
    if (node.handler !== null) {
      visitGuardedCalls(node.handler, tryDepth + 1, imports, output);
    }
    if (node.finalizer !== null) {
      visitGuardedCalls(node.finalizer, tryDepth + 1, imports, output);
    }
    return;
  }

  if (
    tryDepth > 0 &&
    node.type === "CallExpression" &&
    isReactApiCall(node, "use", imports)
  ) {
    output.push(node);
  }

  for (const child of getChildNodes(node)) {
    visitGuardedCalls(child, tryDepth, imports, output);
  }
}

function createFinding(
  node: TSESTree.CallExpression,
  file: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "React use() guarded by try/catch",
    message:
      "React use() is called inside try/catch, which cannot be used to handle its suspended promise or rejected value.",
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Move use() outside try/catch and handle loading with Suspense and rejection with an Error Boundary.",
    confidence: 1,
  };
}
