import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import type { SemanticHookMetadata } from "../../semantic/hook-context";

const ASYNC_CALLBACK_METHODS = new Set(["then", "catch", "finally"]);

const TIMER_FUNCTIONS = new Set([
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
]);

const GLOBAL_IDENTIFIERS = new Set([
  "undefined",
  "NaN",
  "Infinity",
  "console",
  "Math",
  "JSON",
  "Date",
  "Promise",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "RegExp",
  "Error",
  "Set",
  "Map",
  "WeakMap",
  "WeakSet",
  "Symbol",
  "BigInt",
  "Reflect",
  "Intl",
  "URL",
  "URLSearchParams",
  "window",
  "document",
  "globalThis",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
]);

export const reactHooksStaleClosureRule: ReactRule = {
  id: "react.hooks.stale-closure",

  description:
    "Detect render values captured by asynchronous callbacks created inside React Hooks.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    const hook = findHook(node, context.hooks.hooks);

    if (hook === undefined) {
      return [];
    }

    const callback = getHookCallback(node);

    if (callback === undefined) {
      return [];
    }

    const candidates = collectAsyncCallbacks(callback);

    const findings: ReviewFinding[] = [];

    for (const candidate of candidates) {
      const captured = collectCapturedValues(candidate.callback);

      for (const name of captured) {
        if (isKnownSafeCapture(name, candidate.callback)) {
          continue;
        }

        findings.push(createFinding(hook, name, context.file));
      }
    }

    return deduplicateFindings(findings);
  },
};

interface AsyncCallback {
  readonly callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression;
}

function findHook(
  node: TSESTree.CallExpression,
  hooks: readonly SemanticHookMetadata[],
): SemanticHookMetadata | undefined {
  return hooks.find((item) => item.hook.node === node);
}

function getHookCallback(
  node: TSESTree.CallExpression,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | undefined {
  const argument = node.arguments[0];

  if (
    argument?.type === "ArrowFunctionExpression" ||
    argument?.type === "FunctionExpression"
  ) {
    return argument;
  }

  return undefined;
}

function collectAsyncCallbacks(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): AsyncCallback[] {
  const callbacks: AsyncCallback[] = [];

  visitNode(callback.body, (node) => {
    if (node !== callback && isFunction(node) && node.async) {
      callbacks.push({
        callback: node,
      });
      return;
    }
    if (node.type !== "CallExpression" && node.type !== "NewExpression") {
      return;
    }

    if (node.type === "CallExpression") {
      collectTimerCallback(node, callbacks);
      collectPromiseCallback(node, callbacks);
      return;
    }

    if (node.callee.type === "Identifier" && node.callee.name === "Promise") {
      for (const argument of node.arguments) {
        if (isFunction(argument)) {
          callbacks.push({
            callback: argument,
          });
        }
      }
    }
  });

  return callbacks;
}

function collectTimerCallback(
  node: TSESTree.CallExpression,
  callbacks: AsyncCallback[],
): void {
  if (
    node.callee.type !== "Identifier" ||
    !TIMER_FUNCTIONS.has(node.callee.name)
  ) {
    return;
  }

  const callback = node.arguments[0];

  if (isFunction(callback)) {
    callbacks.push({
      callback,
    });
  }
}

function collectPromiseCallback(
  node: TSESTree.CallExpression,
  callbacks: AsyncCallback[],
): void {
  if (node.callee.type !== "MemberExpression") {
    return;
  }

  if (
    node.callee.computed ||
    node.callee.property.type !== "Identifier" ||
    !ASYNC_CALLBACK_METHODS.has(node.callee.property.name)
  ) {
    return;
  }

  const callback = node.arguments[0];

  if (isFunction(callback)) {
    callbacks.push({
      callback,
    });
  }
}

function collectCapturedValues(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): string[] {
  const localBindings = collectLocalBindings(callback);
  const captured = new Set<string>();

  visitNodeWithParent(callback.body, undefined, (node, parent) => {
    if (node.type !== "Identifier") {
      return;
    }

    if (!isReferenceIdentifier(node, parent)) {
      return;
    }

    if (localBindings.has(node.name)) {
      return;
    }

    if (GLOBAL_IDENTIFIERS.has(node.name)) {
      return;
    }

    captured.add(node.name);
  });

  return [...captured].sort();
}

function collectLocalBindings(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): Set<string> {
  const bindings = new Set<string>();

  for (const parameter of callback.params) {
    collectBindingNames(parameter, bindings);
  }

  visitNode(callback.body, (node) => {
    switch (node.type) {
      case "VariableDeclarator":
        collectBindingNames(node.id, bindings);
        break;

      case "FunctionDeclaration":
      case "ClassDeclaration":
        if (node.id !== null) {
          bindings.add(node.id.name);
        }
        break;

      case "CatchClause":
        if (node.param !== null) {
          collectBindingNames(node.param, bindings);
        }
        break;

      default:
        break;
    }
  });

  return bindings;
}

function collectBindingNames(node: TSESTree.Node, bindings: Set<string>): void {
  switch (node.type) {
    case "Identifier":
      bindings.add(node.name);
      return;

    case "AssignmentPattern":
      collectBindingNames(node.left, bindings);
      return;

    case "RestElement":
      collectBindingNames(node.argument, bindings);
      return;

    case "ArrayPattern":
      for (const element of node.elements) {
        if (element !== null) {
          collectBindingNames(element, bindings);
        }
      }
      return;

    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "RestElement") {
          collectBindingNames(property.argument, bindings);
        } else {
          collectBindingNames(property.value, bindings);
        }
      }
      return;

    default:
      return;
  }
}

function isKnownSafeCapture(
  name: string,
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean {
  /*
   * Functional state updates do not read the captured render value:
   *
   * setCount(previous => previous  1)
   *
   * The callback-local parameter is already excluded by
   * collectLocalBindings. This check exists for future extensions
   * and documents the intended safety boundary.
   */
  void callback;

  return name === "previous" || name === "prev";
}

function isReferenceIdentifier(
  node: TSESTree.Identifier,
  parent: TSESTree.Node | undefined,
): boolean {
  if (parent === undefined) {
    return true;
  }

  if (parent.type === "VariableDeclarator" && parent.id === node) {
    return false;
  }

  if (
    (parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ClassDeclaration" ||
      parent.type === "ClassExpression") &&
    parent.id === node
  ) {
    return false;
  }

  if (parent.type === "Property" && parent.key === node && !parent.computed) {
    return false;
  }

  if (
    parent.type === "MemberExpression" &&
    parent.property === node &&
    !parent.computed
  ) {
    return false;
  }

  if (
    parent.type === "MethodDefinition" &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }

  return true;
}

function deduplicateFindings(
  findings: readonly ReviewFinding[],
): ReviewFinding[] {
  const seen = new Set<string>();
  const result: ReviewFinding[] = [];

  for (const finding of findings) {
    if (seen.has(finding.id)) {
      continue;
    }

    seen.add(finding.id);
    result.push(finding);
  }

  return result;
}

function createFinding(
  hook: SemanticHookMetadata,
  dependency: string,
  file: string,
): ReviewFinding {
  return {
    id: [
      "react.hooks.stale-closure",
      file,
      hook.hook.location.line,
      hook.hook.location.column,
      dependency,
    ].join(":"),
    ruleId: "react.hooks.stale-closure",
    title: "Potential stale closure",
    message: `${hook.hook.name} captures render value "${dependency}"  
      "inside an asynchronous callback. The callback may observe a stale value."`,
    severity: "medium",
    source: "ast",
    location: {
      file,
      line: hook.hook.location.line,
      column: hook.hook.location.column,
    },
    suggestion:
      "Include the value in the Hook dependencies or use a ref/functional updater when appropriate.",
    confidence: 1,
  };
}

function isFunction(
  node: unknown,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    ((node as TSESTree.Node).type === "ArrowFunctionExpression" ||
      (node as TSESTree.Node).type === "FunctionExpression")
  );
}

function visitNode(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visitNode(child, callback);
  }
}

function visitNodeWithParent(
  node: TSESTree.Node,
  parent: TSESTree.Node | undefined,
  callback: (node: TSESTree.Node, parent: TSESTree.Node | undefined) => void,
): void {
  callback(node, parent);

  for (const child of getChildNodes(node)) {
    visitNodeWithParent(child, node, callback);
  }
}

function getChildNodes(node: TSESTree.Node): TSESTree.Node[] {
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
