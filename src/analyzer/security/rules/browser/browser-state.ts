import type { TSESTree } from "@typescript-eslint/typescript-estree";

import {
  argumentAt,
  isFunction,
  memberPath,
  nodeName,
  propertyName,
  staticString,
  stringLiteralValue,
  unwrapChain,
  visit,
} from "./browser-syntax";

export type BrowserGlobal =
  | "window"
  | "document"
  | "location"
  | "localStorage"
  | "sessionStorage";

export interface ImportedCallable {
  readonly module: string;
  readonly imported: string;
}

export interface BrowserModelState {
  readonly shadowedGlobals: ReadonlySet<string>;
  readonly globalAliases: ReadonlyMap<string, BrowserGlobal>;
  readonly namespaces: ReadonlyMap<string, string>;
  readonly callables: ReadonlyMap<string, ImportedCallable>;
  readonly messageBindings: ReadonlySet<string>;
}

const TRACKED_GLOBALS = new Set([
  "window",
  "document",
  "location",
  "localStorage",
  "sessionStorage",
  "parent",
  "top",
  "opener",
  "open",
  "postMessage",
  "DOMPurify",
]);

export function buildModelState(ast: TSESTree.Program): BrowserModelState {
  const declarations = new Map<string, number>();
  const namespaces = new Map<string, string>();
  const callables = new Map<string, ImportedCallable>();

  visit(ast, (node) => {
    collectDeclarations(node, declarations);

    if (node.type !== "ImportDeclaration") {
      return;
    }

    const module = stringLiteralValue(node.source);
    if (module === undefined) {
      return;
    }

    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier") {
        namespaces.set(specifier.local.name, module);
        continue;
      }

      if (specifier.type === "ImportDefaultSpecifier") {
        namespaces.set(specifier.local.name, module);
        callables.set(specifier.local.name, { module, imported: "default" });
        continue;
      }

      const imported = nodeName(specifier.imported);
      if (imported !== undefined) {
        callables.set(specifier.local.name, { module, imported });
      }
    }
  });

  const shadowedGlobals = new Set(
    [...declarations.keys()].filter((name) => TRACKED_GLOBALS.has(name)),
  );
  const globalAliases = new Map<string, BrowserGlobal>();
  const messageBindings = new Set<string>();
  const provisional: BrowserModelState = {
    shadowedGlobals,
    globalAliases,
    namespaces,
    callables,
    messageBindings,
  };

  visit(ast, (node) => {
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init !== null &&
      (declarations.get(node.id.name) ?? 0) === 1
    ) {
      const global = resolveGlobal(node.init, provisional);
      if (global !== undefined) {
        globalAliases.set(node.id.name, global);
      }
    }

    collectMessageBinding(node, provisional, messageBindings);
  });

  return provisional;
}

function collectMessageBinding(
  node: TSESTree.Node,
  state: BrowserModelState,
  output: Set<string>,
): void {
  if (node.type === "CallExpression") {
    const eventType = argumentAt(node, 0);
    const callback = argumentAt(node, 1);
    if (
      staticString(eventType ?? node) === "message" &&
      callback !== undefined &&
      isFunction(callback) &&
      isMessageListenerCallee(node.callee, state)
    ) {
      const first = callback.params[0];
      if (first?.type === "Identifier") {
        output.add(first.name);
      }
    }
  }

  if (
    node.type === "AssignmentExpression" &&
    node.left.type === "MemberExpression" &&
    propertyName(node.left.property, node.left.computed) === "onmessage" &&
    isWindowLike(node.left.object, state) &&
    isFunction(node.right)
  ) {
    const first = node.right.params[0];
    if (first?.type === "Identifier") {
      output.add(first.name);
    }
  }
}

function isMessageListenerCallee(
  node: TSESTree.Node,
  state: BrowserModelState,
): boolean {
  if (node.type === "Identifier") {
    return (
      node.name === "addEventListener" && !state.shadowedGlobals.has(node.name)
    );
  }

  return (
    node.type === "MemberExpression" &&
    propertyName(node.property, node.computed) === "addEventListener" &&
    isWindowLike(node.object, state)
  );
}

export function isWindowLike(node: TSESTree.Node, state: BrowserModelState): boolean {
  const expression = unwrapChain(node);
  if (resolveGlobal(expression, state) === "window") {
    return true;
  }

  return (
    expression.type === "Identifier" &&
    new Set(["parent", "top", "opener"]).has(expression.name) &&
    !state.shadowedGlobals.has(expression.name)
  );
}

export function resolveGlobal(
  node: TSESTree.Node,
  state: BrowserModelState,
): BrowserGlobal | undefined {
  const expression = unwrapChain(node);

  if (expression.type === "Identifier") {
    const alias = state.globalAliases.get(expression.name);
    if (alias !== undefined) {
      return alias;
    }

    if (state.shadowedGlobals.has(expression.name)) {
      return undefined;
    }

    if (
      expression.name === "window" ||
      expression.name === "document" ||
      expression.name === "location" ||
      expression.name === "localStorage" ||
      expression.name === "sessionStorage"
    ) {
      return expression.name;
    }

    if (
      expression.name === "parent" ||
      expression.name === "top" ||
      expression.name === "opener"
    ) {
      return "window";
    }

    return undefined;
  }

  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const owner = resolveGlobal(expression.object, state);
  const property = propertyName(expression.property, expression.computed);
  if (owner !== "window" || property === undefined) {
    return undefined;
  }

  if (
    property === "document" ||
    property === "location" ||
    property === "localStorage" ||
    property === "sessionStorage"
  ) {
    return property;
  }

  return undefined;
}

export function callableIdentity(
  node: TSESTree.Node,
  state: BrowserModelState,
): ImportedCallable | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Identifier") {
    return state.callables.get(expression.name);
  }

  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const path = memberPath(expression);
  if (path === undefined || path.length < 2) {
    return undefined;
  }

  const root = path[0];
  const imported = path[path.length - 1];
  if (root === undefined || imported === undefined) {
    return undefined;
  }

  const module = state.namespaces.get(root);
  return module === undefined ? undefined : { module, imported };
}

function collectDeclarations(
  node: TSESTree.Node,
  declarations: Map<string, number>,
): void {
  if (node.type === "VariableDeclarator") {
    collectPatternNames(node.id, declarations);
  }
  if (node.type === "FunctionDeclaration" && node.id !== null) {
    addDeclaration(node.id.name, declarations);
  }
  if (node.type === "ClassDeclaration" && node.id !== null) {
    addDeclaration(node.id.name, declarations);
  }
  if (node.type === "ImportDeclaration") {
    for (const specifier of node.specifiers) {
      addDeclaration(specifier.local.name, declarations);
    }
  }
  if (node.type === "CatchClause" && node.param !== null) {
    collectPatternNames(node.param, declarations);
  }
  if (isFunction(node)) {
    for (const parameter of node.params) {
      collectPatternNames(parameter, declarations);
    }
  }
}

function collectPatternNames(
  pattern: TSESTree.Node,
  declarations: Map<string, number>,
): void {
  switch (pattern.type) {
    case "Identifier":
      addDeclaration(pattern.name, declarations);
      return;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, declarations);
      return;
    case "RestElement":
      collectPatternNames(pattern.argument, declarations);
      return;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element !== null) {
          collectPatternNames(element, declarations);
        }
      }
      return;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          collectPatternNames(property.argument, declarations);
        } else {
          collectPatternNames(property.value, declarations);
        }
      }
      return;
  }
}

function addDeclaration(name: string, declarations: Map<string, number>): void {
  declarations.set(name, (declarations.get(name) ?? 0) + 1);
}
