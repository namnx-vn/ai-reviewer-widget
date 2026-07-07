import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import type { SemanticHookMetadata } from "../../semantic/hook-context";

const TARGET_HOOK = "useEffect";

const STATE_SETTER_PATTERN = /^set[A-Z0-9]/u;

const PURE_CALCULATIONS = new Set([
  "Array",
  "Boolean",
  "Number",
  "Object",
  "String",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
]);

const KNOWN_EXTERNAL_EFFECTS = new Set([
  "fetch",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "requestIdleCallback",
  "addEventListener",
  "removeEventListener",
  "subscribe",
  "unsubscribe",
  "dispatch",
]);

export const reactHooksUnnecessaryEffectRule: ReactRule = {
  id: "react.hooks.unnecessary-effect",

  description:
    "Detect useEffect calls used only for derived state or synchronous calculations.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    const hook = findHook(node, context.hooks.hooks);

    if (hook === undefined || hook.hook.name !== TARGET_HOOK) {
      return [];
    }

    const callback = getCallback(node);

    if (callback === undefined) {
      return [];
    }

    const analysis = analyzeEffect(callback);

    if (!analysis.onlyDerivedState || analysis.setterCalls.length === 0) {
      return [];
    }

    return [
      createFinding(
        hook,
        context.file,
        analysis.setterCalls,
      ),
    ];
  },
};

interface EffectAnalysis {
  readonly onlyDerivedState: boolean;
  readonly setterCalls: readonly TSESTree.CallExpression[];
}

function findHook(
  node: TSESTree.CallExpression,
  hooks: readonly SemanticHookMetadata[],
): SemanticHookMetadata | undefined {
  return hooks.find((item) => item.hook.node === node);
}

function getCallback(
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
  const setterCalls: TSESTree.CallExpression[] = [];
  let hasExternalEffect = false;
  let hasUnsupportedStatement = false;

  const body =
    callback.body.type === "BlockStatement"
      ? callback.body.body
      : [];

  for (const statement of body) {
    if (statement.type === "ReturnStatement") {
      /*
       * Cleanup means the effect has lifecycle semantics.
       */
      if (statement.argument !== null) {
        hasExternalEffect = true;
      }

      continue;
    }

    if (
      statement.type === "VariableDeclaration" &&
      isPureVariableDeclaration(statement)
    ) {
      continue;
    }

    if (
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "CallExpression"
    ) {
      const call = statement.expression;

      if (isStateSetterCall(call)) {
        setterCalls.push(call);

        if (!isDerivedStateSetter(call)) {
          hasUnsupportedStatement = true;
        }

        continue;
      }

      if (isKnownExternalEffect(call)) {
        hasExternalEffect = true;
        continue;
      }

      /*
       * Unknown function calls may have side effects.
       * Do not report them as unnecessary effects.
       */
      hasExternalEffect = true;
      continue;
    }

    /*
     * Direct assignments such as:
     *
     * document.title = title
     *
     * are external synchronization.
     */
    if (
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "AssignmentExpression"
    ) {
      hasExternalEffect = true;
      continue;
    }

    hasUnsupportedStatement = true;
  }

  return {
    onlyDerivedState:
      setterCalls.length > 0 &&
      !hasExternalEffect &&
      !hasUnsupportedStatement,
    setterCalls,
  };
}

function isPureVariableDeclaration(
  statement: TSESTree.VariableDeclaration,
): boolean {
  return statement.declarations.every((declaration) => {
    if (declaration.init === null) {
      return true;
    }

    return isPureExpression(declaration.init);
  });
}

function isDerivedStateSetter(
  call: TSESTree.CallExpression,
): boolean {
  const argument = call.arguments[0];

  if (argument === undefined || argument.type === "SpreadElement") {
    return false;
  }

  if (
    argument.type === "ArrowFunctionExpression" ||
    argument.type === "FunctionExpression"
  ) {
    /*
     * Functional updates such as:
     *
     * setCount(previous => previous + 1)
     *
     * are state transitions rather than derived-state calculations.
     */
    return false;
  }

  return isPureExpression(argument);
}

function isPureExpression(node: TSESTree.Node): boolean {
  switch (node.type) {
    case "Identifier":
    case "Literal":
    case "ThisExpression":
      return true;

    case "TemplateLiteral":
      return node.expressions.every(isPureExpression);

    case "BinaryExpression":
    case "LogicalExpression":
      return (
        isPureExpression(node.left) &&
        isPureExpression(node.right)
      );

    case "UnaryExpression":
      return isPureExpression(node.argument);

    case "ConditionalExpression":
      return (
        isPureExpression(node.test) &&
        isPureExpression(node.consequent) &&
        isPureExpression(node.alternate)
      );

    case "ArrayExpression":
      return node.elements.every(
        (element) =>
          element === null ||
          (element.type !== "SpreadElement" &&
            isPureExpression(element)),
      );

    case "ObjectExpression":
      return node.properties.every((property) => {
        if (property.type === "SpreadElement") {
          return isPureExpression(property.argument);
        }

        return (
          isPureExpression(property.value) &&
          (!property.computed ||
            isPureExpression(property.key))
        );
      });

    case "MemberExpression":
      return (
        isPureExpression(node.object) &&
        (!node.computed || isPureExpression(node.property))
      );

    case "CallExpression":
      return isPureCall(node);

    default:
      return false;
  }
}

function isPureCall(
  node: TSESTree.CallExpression,
): boolean {
  if (
    node.callee.type === "Identifier" &&
    PURE_CALCULATIONS.has(node.callee.name)
  ) {
    return node.arguments.every(
      (argument) =>
        argument.type !== "SpreadElement" &&
        isPureExpression(argument),
    );
  }

  if (node.callee.type === "MemberExpression") {
    if (
      !node.callee.computed &&
      node.callee.property.type === "Identifier" &&
      PURE_CALCULATIONS.has(node.callee.property.name)
    ) {
      return node.arguments.every(
        (argument) =>
          argument.type !== "SpreadElement" &&
          isPureExpression(argument),
      );
    }

    /*
     * Common pure array transformations.
     */
    if (
      !node.callee.computed &&
      node.callee.property.type === "Identifier" &&
      isPureArrayMethod(node.callee.property.name)
    ) {
      return (
        isPureExpression(node.callee.object) &&
        node.arguments.every(
          (argument) =>
            argument.type !== "SpreadElement" &&
            isPureExpression(argument),
        )
      );
    }
  }

  return false;
}

function isPureArrayMethod(name: string): boolean {
  return new Set([
    "filter",
    "map",
    "slice",
    "concat",
    "flat",
    "flatMap",
    "join",
    "includes",
    "indexOf",
    "find",
    "findIndex",
    "some",
    "every",
  ]).has(name);
}

function isStateSetterCall(
  node: TSESTree.CallExpression,
): boolean {
  return (
    node.callee.type === "Identifier" &&
    STATE_SETTER_PATTERN.test(node.callee.name)
  );
}

function isKnownExternalEffect(
  node: TSESTree.CallExpression,
): boolean {
  if (node.callee.type === "Identifier") {
    return KNOWN_EXTERNAL_EFFECTS.has(node.callee.name);
  }

  if (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier"
  ) {
    return KNOWN_EXTERNAL_EFFECTS.has(node.callee.property.name);
  }

  return false;
}

function createFinding(
  hook: SemanticHookMetadata,
  file: string,
  setterCalls: readonly TSESTree.CallExpression[],
): ReviewFinding {
  const setters = setterCalls
    .map((call) =>
      call.callee.type === "Identifier"
        ? call.callee.name
        : "state",
    )
    .join(", ");

  return {
    id: [
      "react.hooks.unnecessary-effect",
      file,
      hook.hook.location.line,
      hook.hook.location.column,
    ].join(":"),
    ruleId: "react.hooks.unnecessary-effect",
    title: "Unnecessary effect",
    message:
      `${hook.hook.name} is used only to derive state ` +
      `(${setters}) from render-time values. This calculation can run during render instead.`,
    severity: "medium",
    source: "ast",
    location: {
      file,
      line: hook.hook.location.line,
      column: hook.hook.location.column,
    },
    suggestion:
      "Derive the value directly during render with an expression or useMemo instead of synchronizing derived state through useEffect.",
    confidence: 0.94,
  };
}