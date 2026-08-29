import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
  collectReferencedIdentifiers,
  collectStateBindings,
  isUseEffectCall,
  visit,
} from "./semantic";

const RULE_ID = "react.state.synchronization";

export const reactStateSynchronizationRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect useEffect calls that only synchronize one state value from render-time inputs.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression" || !isUseEffectCall(node)) {
      return [];
    }

    const callback = node.arguments[0];
    const dependencies = node.arguments[1];

    if (
      (callback?.type !== "ArrowFunctionExpression" &&
        callback?.type !== "FunctionExpression") ||
      dependencies?.type !== "ArrayExpression"
    ) {
      return [];
    }

    const bindings = collectStateBindings(context.ast);
    const setterToState = new Map(
      bindings.map((binding) => [binding.setterName, binding.stateName] as const),
    );
    const setterCalls: TSESTree.CallExpression[] = [];
    let unsupported = false;

    visit(callback.body, (child) => {
      if (child === callback.body) {
        return;
      }

      if (
        child.type === "AssignmentExpression" ||
        child.type === "UpdateExpression"
      ) {
        unsupported = true;
        return;
      }

      if (child.type !== "CallExpression") {
        return;
      }

      if (
        child.callee.type === "Identifier" &&
        setterToState.has(child.callee.name)
      ) {
        setterCalls.push(child);
        return;
      }

      unsupported = true;
    });

    if (unsupported || setterCalls.length !== 1) {
      return [];
    }

    const setterCall = setterCalls[0];
    const argument = setterCall?.arguments[0];

    if (
      setterCall === undefined ||
      setterCall.callee.type !== "Identifier" ||
      argument === undefined ||
      argument.type === "SpreadElement" ||
      argument.type === "ArrowFunctionExpression" ||
      argument.type === "FunctionExpression"
    ) {
      return [];
    }

    const dependencyNames = new Set<string>();
    for (const dependency of dependencies.elements) {
      if (dependency !== null && dependency.type !== "SpreadElement") {
        for (const name of collectReferencedIdentifiers(dependency)) {
          dependencyNames.add(name);
        }
      }
    }

    const argumentReferences = collectReferencedIdentifiers(argument);
    if (
      argumentReferences.size === 0 ||
      ![...argumentReferences].every((name) => dependencyNames.has(name))
    ) {
      return [];
    }

    const stateName = setterToState.get(setterCall.callee.name);
    if (stateName === undefined) {
      return [];
    }

    return [createFinding(node, context.file, stateName)];
  },
};

function createFinding(
  node: TSESTree.CallExpression,
  file: string,
  stateName: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "State synchronization effect",
    message:
      `${stateName} is synchronized from effect dependencies without an external side effect. This creates an avoidable second source of truth.`,
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Derive the value during render instead of copying it into state through useEffect.",
    confidence: 0.95,
  };
}
