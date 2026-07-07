import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import type { SemanticHookMetadata } from "../../semantic/hook-context";

export const reactHooksAsyncEffectRule: ReactRule = {
  id: "react.hooks.async-effect",

  description:
    "Detect unsafe asynchronous useEffect patterns involving async callbacks, missing cancellation, cleanup, and race conditions.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    const hook = findHook(node, context.hooks.hooks);

    if (hook === undefined || hook.hook.name !== "useEffect") {
      return [];
    }

    const callback = getEffectCallback(node);

    if (callback === undefined) {
      return [];
    }

    const analysis = analyzeEffect(callback);

    if (analysis.asyncEffectCallback) {
      return [
        createFinding(
          hook,
          context.file,
          "async-callback",
        ),
      ];
    }

    if (analysis.asyncOperationWithoutCancellation) {
      return [
        createFinding(
          hook,
          context.file,
          "missing-cancellation",
        ),
      ];
    }

    if (
      analysis.asyncOperationWithStateUpdate &&
      !analysis.hasCleanup
    ) {
      return [
        createFinding(
          hook,
          context.file,
          "race-condition",
        ),
      ];
    }

    return [];
  },
};

type AsyncEffectIssue =
  | "async-callback"
  | "missing-cancellation"
  | "race-condition";

interface EffectAnalysis {
  readonly asyncEffectCallback: boolean;
  readonly asyncOperationWithoutCancellation: boolean;
  readonly asyncOperationWithStateUpdate: boolean;
  readonly hasCleanup: boolean;
}

function findHook(
  node: TSESTree.CallExpression,
  hooks: readonly SemanticHookMetadata[],
): SemanticHookMetadata | undefined {
  return hooks.find((item) => item.hook.node === node);
}

function getEffectCallback(
  node: TSESTree.CallExpression,
):
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | undefined {
  const argument = node.arguments[0];

  if (
    argument?.type === "ArrowFunctionExpression" ||
    argument?.type === "FunctionExpression"
  ) {
    return argument;
  }

  return undefined;
}

function analyzeEffect(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression,
): EffectAnalysis {
  const asyncEffectCallback = callback.async;

  const hasCleanup = hasCleanupReturn(callback);

  const asyncOperations = collectAsyncOperations(callback);

  const asyncOperationWithStateUpdate = asyncOperations.some(
    (operation) => operation.containsStateUpdate,
  );

  const asyncOperationWithoutCancellation =
    asyncOperations.some(
      (operation) =>
        operation.requiresCancellation &&
        !operation.hasCancellation,
    );

  return {
    asyncEffectCallback,
    asyncOperationWithoutCancellation,
    asyncOperationWithStateUpdate,
    hasCleanup,
  };
}

interface AsyncOperation {
  readonly requiresCancellation: boolean;
  readonly hasCancellation: boolean;
  readonly containsStateUpdate: boolean;
}

function collectAsyncOperations(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression,
): AsyncOperation[] {
  const operations: AsyncOperation[] = [];

  visitNode(callback.body, (node) => {
    if (node.type !== "CallExpression") {
      return;
    }

    if (isFetchCall(node)) {
      operations.push({
        requiresCancellation: true,
        hasCancellation: hasAbortSignal(node),
        containsStateUpdate: hasStateUpdateAfter(node, callback),
      });

      return;
    }

    if (isPromiseCall(node)) {
      operations.push({
        requiresCancellation: true,
        hasCancellation: hasPromiseCancellation(node),
        containsStateUpdate: hasStateUpdateAfter(node, callback),
      });
    }
  });

  return operations;
}

function isFetchCall(
  node: TSESTree.CallExpression,
): boolean {
  return (
    node.callee.type === "Identifier" &&
    node.callee.name === "fetch"
  );
}

function isPromiseCall(
  node: TSESTree.CallExpression,
): boolean {
  if (node.callee.type !== "MemberExpression") {
    return false;
  }

  if (
    node.callee.computed ||
    node.callee.property.type !== "Identifier"
  ) {
    return false;
  }

  return (
    node.callee.property.name === "then" ||
    node.callee.property.name === "catch" ||
    node.callee.property.name === "finally"
  );
}

function hasAbortSignal(
  node: TSESTree.CallExpression,
): boolean {
  const options = node.arguments[1];

  if (
    options === undefined ||
    options.type === "SpreadElement" ||
    options.type !== "ObjectExpression"
  ) {
    return false;
  }

  return options.properties.some((property) => {
    if (property.type !== "Property") {
      return false;
    }

    if (
      property.key.type !== "Identifier" ||
      property.key.name !== "signal"
    ) {
      return false;
    }

    return true;
  });
}

function hasPromiseCancellation(
  node: TSESTree.CallExpression,
): boolean {
  /*
   * Promise cancellation is not native. Treat an AbortController,
   * signal check, or cleanup guard as the supported cancellation
   * patterns.
   */
  return containsCancellationIdentifier(node);
}

function containsCancellationIdentifier(
  node: TSESTree.Node,
): boolean {
  let found = false;

  visitNode(node, (child) => {
    if (child.type !== "Identifier") {
      return;
    }

    if (
      child.name === "signal" ||
      child.name === "aborted" ||
      child.name === "cancelled" ||
      child.name === "canceled" ||
      child.name === "isMounted"
    ) {
      found = true;
    }
  });

  return found;
}

function hasStateUpdateAfter(
  operation: TSESTree.CallExpression,
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression,
): boolean {
  const operationEnd = operation.range?.[1];

  if (operationEnd === undefined) {
    return false;
  }

  let found = false;

  visitNode(callback.body, (node) => {
    if (
      node.type !== "CallExpression" ||
      node.range?.[0] === undefined
    ) {
      return;
    }

    if (node.range[0] <= operationEnd) {
      return;
    }

    if (isStateSetterCall(node)) {
      found = true;
    }
  });

  return found;
}

function isStateSetterCall(
  node: TSESTree.CallExpression,
): boolean {
  return (
    node.callee.type === "Identifier" &&
    /^set[A-Z0-9]/u.test(node.callee.name)
  );
}

function hasCleanupReturn(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression,
): boolean {
  if (callback.body.type !== "BlockStatement") {
    return false;
  }

  return callback.body.body.some(
    (statement) =>
      statement.type === "ReturnStatement" &&
      statement.argument !== null,
  );
}

function createFinding(
  hook: SemanticHookMetadata,
  file: string,
  issue: AsyncEffectIssue,
): ReviewFinding {
  const messages: Record<
    AsyncEffectIssue,
    {
      title: string;
      message: string;
      suggestion: string;
    }
  > = {
    "async-callback": {
      title: "Async effect callback",
      message:
        "useEffect callback is async. React expects the effect callback to return either nothing or a cleanup function, not a Promise.",
      suggestion:
        "Keep the effect callback synchronous and invoke an inner async function instead.",
    },

    "missing-cancellation": {
      title: "Async effect without cancellation",
      message:
        "The effect starts an asynchronous operation without an observable cancellation mechanism.",
      suggestion:
        "Use AbortController or another cancellation mechanism and abort it from the effect cleanup.",
    },

    "race-condition": {
      title: "Potential async effect race",
      message:
        "An asynchronous operation can update component state after a newer render has started another operation.",
      suggestion:
        "Cancel the previous operation or guard the result in the cleanup path before updating state.",
    },
  };

  const metadata = messages[issue];

  return {
    id: [
      "react.hooks.async-effect",
      file,
      hook.hook.location.line,
      hook.hook.location.column,
      issue,
    ].join(":"),
    ruleId: "react.hooks.async-effect",
    title: metadata.title,
    message: metadata.message,
    severity: "high",
    source: "ast",
    location: {
      file,
      line: hook.hook.location.line,
      column: hook.hook.location.column,
    },
    suggestion: metadata.suggestion,
    confidence: issue === "async-callback" ? 1 : 0.9,
  };
}

function visitNode(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visitNode(value, callback);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        visitNode(item, callback);
      }
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}