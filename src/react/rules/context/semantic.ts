import type { TSESTree } from "@typescript-eslint/typescript-estree";

import {
  getJSXAttribute,
  getJSXExpression,
  getJSXName,
} from "../../ast/jsx-utils";
import type { ReactRuleContext } from "../../engine/react-rule";
import type { ComponentMetadata } from "../../semantic/component-analyzer";

export type ContextValueKind =
  | "unstable-object"
  | "unstable-array"
  | "unstable-function"
  | "memoized-object"
  | "stable"
  | "unknown";

export interface ContextProviderMetadata {
  readonly contextName: string;
  readonly node: TSESTree.JSXElement;
  readonly valueExpression?: TSESTree.Expression;
  readonly component?: ComponentMetadata;
}

export interface ContextAnalysisResult {
  readonly contexts: ReadonlySet<string>;
  readonly providers: readonly ContextProviderMetadata[];
}

export interface ContextValueAnalysis {
  readonly kind: ContextValueKind;
  readonly resolvedExpression?: TSESTree.Expression;
  readonly objectExpression?: TSESTree.ObjectExpression;
}

const PROVIDER_SUFFIX = ".Provider";
const MEMO_HOOKS = new Set(["useMemo", "useCallback"]);
const STATE_HOOKS = new Set(["useState", "useReducer"]);
const analysisCache = new WeakMap<TSESTree.Program, ContextAnalysisResult>();

export function analyzeContextUsage(
  context: ReactRuleContext,
): ContextAnalysisResult {
  const cached = analysisCache.get(context.ast);

  if (cached !== undefined) {
    return cached;
  }

  const contexts = collectContextDefinitions(context.ast);
  const providers: ContextProviderMetadata[] = [];

  visit(context.ast, (node) => {
    if (node.type !== "JSXElement") {
      return;
    }

    const contextName = getProviderContextName(node, contexts);

    if (contextName === undefined) {
      return;
    }

    const valueAttribute = getJSXAttribute(node.openingElement, "value");
    const valueExpression =
      valueAttribute === undefined
        ? undefined
        : getJSXExpression(valueAttribute) ?? undefined;

    providers.push({
      contextName,
      node,
      valueExpression,
      component: findEnclosingComponent(node, context),
    });
  });

  const result: ContextAnalysisResult = {
    contexts,
    providers,
  };

  analysisCache.set(context.ast, result);

  return result;
}

export function findProviderForNode(
  node: TSESTree.JSXElement,
  context: ReactRuleContext,
): ContextProviderMetadata | undefined {
  return analyzeContextUsage(context).providers.find(
    (provider) => provider.node === node,
  );
}

export function analyzeProviderValue(
  provider: ContextProviderMetadata,
): ContextValueAnalysis {
  const expression = provider.valueExpression;

  if (expression === undefined) {
    return { kind: "unknown" };
  }

  return analyzeExpression(
    expression,
    provider.component,
  );
}

export function collectProviderDynamicRoots(
  provider: ContextProviderMetadata,
): readonly string[] {
  const component = provider.component;

  if (component === undefined) {
    return [];
  }

  const analysis = analyzeProviderValue(provider);
  const objectExpression = analysis.objectExpression;

  if (
    analysis.kind !== "memoized-object" ||
    objectExpression === undefined
  ) {
    return [];
  }

  const dynamicBindings = collectDynamicBindings(component);
  const referenced = collectReferencedIdentifiers(objectExpression);

  return [...referenced]
    .filter((name) => dynamicBindings.has(name))
    .sort();
}

export function countObjectProperties(
  expression: TSESTree.ObjectExpression,
): number {
  return expression.properties.filter(
    (property) => property.type === "Property",
  ).length;
}

export function getProviderAncestors(
  provider: ContextProviderMetadata,
  context: ReactRuleContext,
): readonly ContextProviderMetadata[] {
  return analyzeContextUsage(context).providers
    .filter(
      (candidate) =>
        candidate !== provider &&
        containsNode(candidate.node, provider.node),
    )
    .sort(
      (left, right) =>
        getRangeSize(right.node) - getRangeSize(left.node),
    );
}

export function getProviderValueSignature(
  provider: ContextProviderMetadata,
  source: string,
): string | undefined {
  const expression = provider.valueExpression;
  const start = expression?.range?.[0];
  const end = expression?.range?.[1];

  if (
    expression === undefined ||
    start === undefined ||
    end === undefined
  ) {
    return undefined;
  }

  return source
    .slice(start, end)
    .replace(/\s+/gu, "");
}

function collectContextDefinitions(
  ast: TSESTree.Program,
): ReadonlySet<string> {
  const contexts = new Set<string>();

  visit(ast, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      node.id.type !== "Identifier" ||
      node.init?.type !== "CallExpression" ||
      getCallName(node.init) !== "createContext"
    ) {
      return;
    }

    contexts.add(node.id.name);
  });

  return contexts;
}

function getProviderContextName(
  node: TSESTree.JSXElement,
  contexts: ReadonlySet<string>,
): string | undefined {
  const name = getJSXName(node.openingElement.name);

  if (
    name === undefined ||
    !name.endsWith(PROVIDER_SUFFIX)
  ) {
    return undefined;
  }

  const contextName = name.slice(0, -PROVIDER_SUFFIX.length);

  return contexts.has(contextName)
    ? contextName
    : undefined;
}

function analyzeExpression(
  expression: TSESTree.Expression,
  component: ComponentMetadata | undefined,
): ContextValueAnalysis {
  switch (expression.type) {
    case "ObjectExpression":
      return {
        kind: "unstable-object",
        resolvedExpression: expression,
        objectExpression: expression,
      };

    case "ArrayExpression":
      return {
        kind: "unstable-array",
        resolvedExpression: expression,
      };

    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return {
        kind: "unstable-function",
        resolvedExpression: expression,
      };

    case "Identifier":
      return analyzeIdentifier(expression.name, component);

    case "CallExpression": {
      const callName = getCallName(expression);

      if (!MEMO_HOOKS.has(callName ?? "")) {
        return {
          kind: "unknown",
          resolvedExpression: expression,
        };
      }

      const memoizedObject = getMemoizedObject(expression);

      return memoizedObject === undefined
        ? {
            kind: "stable",
            resolvedExpression: expression,
          }
        : {
            kind: "memoized-object",
            resolvedExpression: expression,
            objectExpression: memoizedObject,
          };
    }

    case "Literal":
    case "MemberExpression":
    case "TemplateLiteral":
    case "BinaryExpression":
    case "LogicalExpression":
    case "UnaryExpression":
    case "ConditionalExpression":
      return {
        kind: "stable",
        resolvedExpression: expression,
      };

    default:
      return {
        kind: "unknown",
        resolvedExpression: expression,
      };
  }
}

function analyzeIdentifier(
  name: string,
  component: ComponentMetadata | undefined,
): ContextValueAnalysis {
  if (component === undefined) {
    return { kind: "stable" };
  }

  const binding = findRenderScopeBinding(component.node, name);

  if (binding === undefined) {
    return { kind: "stable" };
  }

  if (binding.type === "FunctionDeclaration") {
    return {
      kind: "unstable-function",
    };
  }

  if (binding.init === null) {
    return { kind: "unknown" };
  }

  return analyzeExpression(binding.init, undefined);
}

function findRenderScopeBinding(
  componentNode: TSESTree.Node,
  name: string,
): TSESTree.VariableDeclarator | TSESTree.FunctionDeclaration | undefined {
  let result:
    | TSESTree.VariableDeclarator
    | TSESTree.FunctionDeclaration
    | undefined;

  visitRenderScope(componentNode, componentNode, (node) => {
    if (result !== undefined) {
      return;
    }

    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.id.name === name
    ) {
      result = node;
      return;
    }

    if (
      node.type === "FunctionDeclaration" &&
      node.id?.name === name
    ) {
      result = node;
    }
  });

  return result;
}

function getMemoizedObject(
  call: TSESTree.CallExpression,
): TSESTree.ObjectExpression | undefined {
  if (getCallName(call) !== "useMemo") {
    return undefined;
  }

  const callback = call.arguments[0];

  if (
    callback?.type !== "ArrowFunctionExpression" &&
    callback?.type !== "FunctionExpression"
  ) {
    return undefined;
  }

  if (callback.body.type === "ObjectExpression") {
    return callback.body;
  }

  if (callback.body.type !== "BlockStatement") {
    return undefined;
  }

  for (const statement of callback.body.body) {
    if (
      statement.type === "ReturnStatement" &&
      statement.argument?.type === "ObjectExpression"
    ) {
      return statement.argument;
    }
  }

  return undefined;
}

function collectDynamicBindings(
  component: ComponentMetadata,
): ReadonlySet<string> {
  const dynamic = new Set<string>();
  const functionNode = getFunctionNode(component.node);

  if (functionNode !== undefined) {
    for (const parameter of functionNode.params) {
      collectBindingIdentifiers(parameter, dynamic);
    }
  }

  const declarations: TSESTree.VariableDeclarator[] = [];

  visitRenderScope(component.node, component.node, (node) => {
    if (node.type !== "VariableDeclarator") {
      return;
    }

    declarations.push(node);

    if (
      node.id.type === "ArrayPattern" &&
      node.init?.type === "CallExpression" &&
      STATE_HOOKS.has(getCallName(node.init) ?? "")
    ) {
      const state = node.id.elements[0];

      if (state?.type === "Identifier") {
        dynamic.add(state.name);
      }

      return;
    }

    if (
      node.id.type === "Identifier" &&
      node.init?.type === "CallExpression" &&
      getCallName(node.init) === "useContext"
    ) {
      dynamic.add(node.id.name);
    }
  });

  let changed = true;

  while (changed) {
    changed = false;

    for (const declaration of declarations) {
      if (
        declaration.id.type !== "Identifier" ||
        declaration.init === null ||
        dynamic.has(declaration.id.name)
      ) {
        continue;
      }

      const referenced = collectReferencedIdentifiers(declaration.init);

      if ([...referenced].some((name) => dynamic.has(name))) {
        dynamic.add(declaration.id.name);
        changed = true;
      }
    }
  }

  return dynamic;
}

function collectBindingIdentifiers(
  node: TSESTree.Node,
  names: Set<string>,
): void {
  switch (node.type) {
    case "Identifier":
      names.add(node.name);
      return;

    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "Property") {
          collectBindingIdentifiers(property.value, names);
        } else {
          collectBindingIdentifiers(property.argument, names);
        }
      }
      return;

    case "ArrayPattern":
      for (const element of node.elements) {
        if (element !== null) {
          collectBindingIdentifiers(element, names);
        }
      }
      return;

    case "AssignmentPattern":
      collectBindingIdentifiers(node.left, names);
      return;

    case "RestElement":
      collectBindingIdentifiers(node.argument, names);
      return;

    case "TSParameterProperty":
      collectBindingIdentifiers(node.parameter, names);
      return;

    default:
      return;
  }
}

function collectReferencedIdentifiers(
  node: TSESTree.Node,
): ReadonlySet<string> {
  const names = new Set<string>();

  visit(node, (child) => {
    if (child.type === "Identifier") {
      names.add(child.name);
    }
  });

  return names;
}

function findEnclosingComponent(
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
      getRangeSize(component.node) < getRangeSize(result.node)
    ) {
      result = component;
    }
  }

  return result;
}

function getFunctionNode(
  node: TSESTree.Node,
):
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | undefined {
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    return node;
  }

  return undefined;
}

function getCallName(
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

function visitRenderScope(
  node: TSESTree.Node,
  root: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    if (child !== root && isFunctionNode(child)) {
      callback(child);
      continue;
    }

    visitRenderScope(child, root, callback);
  }
}

function isFunctionNode(node: TSESTree.Node): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function containsNode(
  parent: TSESTree.Node,
  child: TSESTree.Node,
): boolean {
  const parentStart = parent.range?.[0];
  const parentEnd = parent.range?.[1];
  const childStart = child.range?.[0];
  const childEnd = child.range?.[1];

  return (
    parentStart !== undefined &&
    parentEnd !== undefined &&
    childStart !== undefined &&
    childEnd !== undefined &&
    parentStart <= childStart &&
    childEnd <= parentEnd
  );
}

function getRangeSize(node: TSESTree.Node): number {
  const start = node.range?.[0];
  const end = node.range?.[1];

  if (start === undefined || end === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }

  return end - start;
}

function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

function getChildNodes(
  node: TSESTree.Node,
): readonly TSESTree.Node[] {
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
