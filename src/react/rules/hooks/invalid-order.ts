import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import type { SemanticHookMetadata } from "../../semantic/hook-context";

export const reactHooksInvalidOrderRule: ReactRule = {
  id: "react.hooks.invalid-order",

  description:
    "Detect React Hooks outside valid component or custom Hook boundaries.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    const hook = context.hooks.hooks.find(
      (item) => item.hook.node === node,
    );

    if (hook === undefined) {
      return [];
    }

    const boundary = hook.execution.functionBoundary;

    if (boundary === undefined) {
      return [createFinding(hook, context.file)];
    }

    if (!boundary.isComponent && !boundary.isCustomHook) {
      return [createFinding(hook, context.file)];
    }

    /*
     * A Hook must belong directly to its component/custom-hook
     * boundary. A custom Hook nested inside another function is
     * still an invalid Rules-of-Hooks boundary.
     */
    if (
      hook.execution.isNestedFunction &&
      !boundary.isComponent
    ) {
      return [createFinding(hook, context.file)];
    }

    return [];
  },
};

function createFinding(
  hook: SemanticHookMetadata,
  file: string,
): ReviewFinding {
  return {
    id: [
      "react.hooks.invalid-order",
      file,
      hook.hook.location.line,
      hook.hook.location.column,
    ].join(":"),
    ruleId: "react.hooks.invalid-order",
    title: "Invalid Hook placement",
    message:
      `${hook.hook.name} is called outside a valid React component ` +
      "or custom Hook boundary.",
    severity: "high",
    source: "ast",
    location: {
      file,
      line: hook.hook.location.line,
      column: hook.hook.location.column,
    },
    suggestion:
      "Call Hooks only at the top level of a React component or custom Hook.",
    confidence: 1,
  };
}