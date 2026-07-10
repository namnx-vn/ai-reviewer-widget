import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReactRuleContext } from "../../engine/react-rule";
import type { ComponentMetadata } from "../../semantic/component-analyzer";

const COLLECTION_PASS_METHODS = new Set([
  "filter",
  "flatMap",
  "map",
  "reduce",
  "reduceRight",
  "sort",
  "toSorted",
]);

export function findEnclosingComponent(
  node: TSESTree.Node,
  context: ReactRuleContext,
): ComponentMetadata | undefined {
  let result: ComponentMetadata | undefined;

  for (const component of context.hooks.components.components) {
    if (!containsNode(component.node, node)) {
      continue;
    }

    if (
      result === undefined ||
      getNodeRangeSize(component.node) < getNodeRangeSize(result.node)
    ) {
      result = component;
    }
  }

  return result;
}

export function isRenderPhaseNode(
  node: TSESTree.Node,
  context: ReactRuleContext,
): boolean {
  const component = findEnclosingComponent(node, context);

  if (component === undefined) {
    return false;
  }

  return !context.hooks.functions.some(
    (boundary) =>
      boundary.node !== component.node &&
      containsNode(component.node, boundary.node) &&
      containsNode(boundary.node, node),
  );
}

export function getCallName(
  node: TSESTree.CallExpression,
): string | undefined {
  if (node.callee.type === "Identifier") {
    return node.callee.name;
  }

  if (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier"
  ) {
    return node.callee.property.name;
  }

  return undefined;
}

export function getMemberCallName(
  node: TSESTree.CallExpression,
): string | undefined {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.property.type !== "Identifier"
  ) {
    return undefined;
  }

  return node.callee.property.name;
}

export function getCallChainMethods(
  node: TSESTree.CallExpression,
): readonly string[] {
  const methods: string[] = [];
  let current: TSESTree.Node = node;

  while (
    current.type === "CallExpression" &&
    current.callee.type === "MemberExpression" &&
    !current.callee.computed &&
    current.callee.property.type === "Identifier"
  ) {
    methods.push(current.callee.property.name);
    current = current.callee.object;
  }

  return methods.reverse();
}

export function getCallChainRoot(
  node: TSESTree.CallExpression,
): TSESTree.Node {
  let current: TSESTree.Node = node;

  while (
    current.type === "CallExpression" &&
    current.callee.type === "MemberExpression"
  ) {
    current = current.callee.object;
  }

  return current;
}

export function countCollectionPasses(
  node: TSESTree.CallExpression,
): number {
  return getCallChainMethods(node).filter((method) =>
    COLLECTION_PASS_METHODS.has(method),
  ).length;
}

export function isOutermostMemberCall(
  node: TSESTree.CallExpression,
  component: ComponentMetadata,
): boolean {
  let chained = false;

  visit(component.node, (candidate) => {
    if (
      candidate.type === "CallExpression" &&
      candidate.callee.type === "MemberExpression" &&
      candidate.callee.object === node
    ) {
      chained = true;
    }
  });

  return !chained;
}

export function isDynamicComponentInput(
  node: TSESTree.Node,
  component: ComponentMetadata,
): boolean {
  const rootName = getRootIdentifier(node);

  if (rootName === undefined) {
    return false;
  }

  return collectComponentInputNames(component).has(rootName);
}

export function isStaticallyBoundedCollection(
  node: TSESTree.Node,
): boolean {
  let bounded = false;

  visit(node, (candidate) => {
    if (
      candidate.type !== "CallExpression" ||
      getMemberCallName(candidate) !== "slice"
    ) {
      return;
    }

    const start = candidate.arguments[0];
    const end = candidate.arguments[1];

    if (
      start?.type === "Literal" &&
      start.value === 0 &&
      end?.type === "Literal" &&
      typeof end.value === "number" &&
      Number.isFinite(end.value) &&
      end.value <= 100
    ) {
      bounded = true;
    }
  });

  return bounded;
}

export function callbackReturnsJsx(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression,
): boolean {
  if (callback.body.type !== "BlockStatement") {
    return expressionContainsJsx(callback.body);
  }

  return callback.body.body.some(
    (statement) =>
      statement.type === "ReturnStatement" &&
      statement.argument !== null &&
      expressionContainsJsx(statement.argument),
  );
}

export function getReturnedExpression(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression,
): TSESTree.Expression | undefined {
  if (callback.body.type !== "BlockStatement") {
    return callback.body;
  }

  if (callback.body.body.length !== 1) {
    return undefined;
  }

  const statement = callback.body.body[0];

  if (
    statement?.type !== "ReturnStatement" ||
    statement.argument === null
  ) {
    return undefined;
  }

  return statement.argument;
}

export function isTrivialExpression(
  node: TSESTree.Node,
): boolean {
  switch (node.type) {
    case "Identifier":
    case "Literal":
    case "ThisExpression":
      return true;

    case "MemberExpression":
      return (
        isTrivialExpression(node.object) &&
        (!node.computed || isTrivialExpression(node.property))
      );

    case "UnaryExpression":
      return isTrivialExpression(node.argument);

    case "BinaryExpression":
    case "LogicalExpression":
      return (
        isTrivialExpression(node.left) &&
        isTrivialExpression(node.right)
      );

    case "ConditionalExpression":
      return (
        isTrivialExpression(node.test) &&
        isTrivialExpression(node.consequent) &&
        isTrivialExpression(node.alternate)
      );

    case "TemplateLiteral":
      return node.expressions.every(isTrivialExpression);

    default:
      return false;
  }
}

export function getNormalizedSource(
  node: TSESTree.Node,
  source: string,
): string | undefined {
  const start = node.range?.[0];
  const end = node.range?.[1];

  if (start === undefined || end === undefined) {
    return undefined;
  }

  return source
    .slice(start, end)
    .replace(/\s+/gu, " ")
    .trim();
}

export function getRootIdentifier(
  node: TSESTree.Node,
): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "MemberExpression") {
    return getRootIdentifier(node.object);
  }

  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression"
  ) {
    return getRootIdentifier(node.callee.object);
  }

  return undefined;
}

export function containsNode(
  parent: TSESTree.Node,
  child: TSESTree.Node,
): boolean {
  const parentStart = parent.range?.[0];
  const parentEnd = parent.range?.[1];
  const childStart = child.range?.[0];
  const childEnd = child.range?.[1];

  if (
    parentStart === undefined ||
    parentEnd === undefined ||
    childStart === undefined ||
    childEnd === undefined
  ) {
    return false;
  }

  return parentStart <= childStart && childEnd <= parentEnd;
}

export function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

function collectComponentInputNames(
  component: ComponentMetadata,
): ReadonlySet<string> {
  const names = new Set<string>();

  if (isFunctionNode(component.node)) {
    for (const parameter of component.node.params) {
      collectBindingNames(parameter, names);
    }
  }

  visit(component.node, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      node.id.type !== "ArrayPattern" ||
      node.init?.type !== "CallExpression"
    ) {
      return;
    }

    const hookName = getCallName(node.init);

    if (hookName !== "useState" && hookName !== "useReducer") {
      return;
    }

    const state = node.id.elements[0];

    if (state?.type === "Identifier") {
      names.add(state.name);
    }
  });

  return names;
}

function collectBindingNames(
  node: TSESTree.Node,
  names: Set<string>,
): void {
  switch (node.type) {
    case "Identifier":
      names.add(node.name);
      return;

    case "AssignmentPattern":
      collectBindingNames(node.left, names);
      return;

    case "RestElement":
      collectBindingNames(node.argument, names);
      return;

    case "ArrayPattern":
      for (const element of node.elements) {
        if (element !== null) {
          collectBindingNames(element, names);
        }
      }
      return;

    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "RestElement") {
          collectBindingNames(property.argument, names);
          continue;
        }

        collectBindingNames(property.value, names);
      }
      return;

    default:
      return;
  }
}

function expressionContainsJsx(
  node: TSESTree.Node,
): boolean {
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return true;
  }

  if (isFunctionNode(node)) {
    return false;
  }

  return getChildNodes(node).some(expressionContainsJsx);
}

function isFunctionNode(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function getNodeRangeSize(node: TSESTree.Node): number {
  const start = node.range?.[0];
  const end = node.range?.[1];

  if (start === undefined || end === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }

  return end - start;
}

function getChildNodes(node: TSESTree.Node): readonly TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        children.push(item);
      }
    }
  }

  return children;
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}
