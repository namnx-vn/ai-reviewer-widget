import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { visit } from "../../ast/component-utils";
import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import { getReactQueryApiName } from "./library-context";

const RULE_ID = "react.patterns.query-key-stability";

export const reactPatternsQueryKeyStabilityRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect React Query keys that contain statically non-deterministic values.",

  check(node, context) {
    if (node.type !== "CallExpression") {
      return [];
    }

    const apiName = getReactQueryApiName(node, context);

    if (apiName !== "useQuery" && apiName !== "useInfiniteQuery") {
      return [];
    }

    const queryKey = getQueryKeyNode(node);

    if (
      queryKey === undefined ||
      !containsNonDeterministicValue(queryKey)
    ) {
      return [];
    }

    return [createFinding(context.file, node)];
  },
};

function getQueryKeyNode(
  node: TSESTree.CallExpression,
): TSESTree.Node | undefined {
  const firstArgument = node.arguments[0];

  if (
    firstArgument === undefined ||
    firstArgument.type === "SpreadElement"
  ) {
    return undefined;
  }

  if (firstArgument.type !== "ObjectExpression") {
    return firstArgument;
  }

  for (const property of firstArgument.properties) {
    if (
      property.type !== "Property" ||
      property.computed ||
      getPropertyName(property.key) !== "queryKey"
    ) {
      continue;
    }

    return property.value;
  }

  return undefined;
}

function containsNonDeterministicValue(
  expression: TSESTree.Node,
): boolean {
  let found = false;

  visit(expression, (node) => {
    if (found) {
      return;
    }

    if (
      node.type === "ArrowFunctionExpression" ||
      node.type === "FunctionExpression"
    ) {
      found = true;
      return;
    }

    if (
      node.type === "NewExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "Date"
    ) {
      found = true;
      return;
    }

    if (node.type !== "CallExpression") {
      return;
    }

    const callName = getMemberCallName(node);

    if (
      callName === "Math.random" ||
      callName === "Date.now" ||
      callName === "crypto.randomUUID" ||
      callName === "performance.now"
    ) {
      found = true;
    }
  });

  return found;
}

function getMemberCallName(
  node: TSESTree.CallExpression,
): string | undefined {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.object.type !== "Identifier" ||
    node.callee.property.type !== "Identifier"
  ) {
    return undefined;
  }

  return `${node.callee.object.name}.${node.callee.property.name}`;
}

function getPropertyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (
    node.type === "Literal" &&
    typeof node.value === "string"
  ) {
    return node.value;
  }

  return undefined;
}

function createFinding(
  file: string,
  node: TSESTree.CallExpression,
): ReviewFinding {
  return {
    id: [
      RULE_ID,
      file,
      node.loc?.start.line ?? 1,
      node.loc?.start.column ?? 0,
    ].join(":"),
    ruleId: RULE_ID,
    title: "Non-deterministic React Query key",
    message:
      "This query key contains a function, current time, random value, or other statically non-deterministic input, so cache identity can change independently of application state.",
    severity: "high",
    source: "ast",
    location: {
      file,
      line: node.loc?.start.line ?? 1,
      column: node.loc?.start.column ?? 0,
    },
    suggestion:
      "Build the query key only from deterministic, serializable application inputs that identify the requested data.",
    confidence: 0.99,
  };
}
