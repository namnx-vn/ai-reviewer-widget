import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import type { HookMetadata } from "../../semantic/hook-analyzer";
import {
  analyzeDependencyHookCall,
  getDependencyHookConfiguration,
} from "../../semantic/dependency-hooks";

const GLOBAL_OBJECTS = new Set([
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
]);

const GLOBAL_IDENTIFIERS = new Set(["undefined", "NaN", "Infinity"]);

export const reactHooksMissingDepsRule: ReactRule = {
  id: "react.hooks.missing-deps",

  description:
    "Detect React hooks that capture render values missing from their dependency array.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    const hook = findHook(node, context.hooks.hooks);

    const hookName = hook?.hook.name ?? getCalleeName(node);
    if (hookName === undefined) {
      return [];
    }

    const configuration = getDependencyHookConfiguration(
      hookName,
      context.dependencyHooks ?? [],
    );

    if (configuration === undefined) {
      return [];
    }

    const dependencyCall = analyzeDependencyHookCall(node, configuration);

    if (dependencyCall === undefined) {
      return [];
    }

    const captured = collectCapturedDependencies(dependencyCall.callback);

    const declared = collectDeclaredDependencies(dependencyCall.dependencyArray);

    const missing = captured.filter((dependency) => !declared.has(dependency));

    if (missing.length === 0) {
      return [];
    }

    return [
      {
        id: [
          "react.hooks.missing-deps",
          context.file,
          node.loc?.start.line ?? 1,
          node.loc?.start.column ?? 0,
        ].join(":"),
        ruleId: "react.hooks.missing-deps",
        title: "Missing hook dependencies",
        message:
          `${configuration.name} is missing dependencies: ` +
          `${missing.join(", ")}.`,
        severity: "medium",
        source: "ast",
        location: {
          file: context.file,
          line: node.loc?.start.line ?? 1,
          column: node.loc?.start.column ?? 0,
        },
        suggestion: `Add ${missing.join(", ")} to the dependency array.`,
        confidence: 1,
      },
    ];
  },
};

function findHook(
  node: TSESTree.CallExpression,
  hooks: readonly {
    hook: HookMetadata;
  }[],
):
  | {
      hook: HookMetadata;
    }
  | undefined {
  return hooks.find((item) => item.hook.node === node);
}

function getCalleeName(node: TSESTree.CallExpression): string | undefined {
  return node.callee.type === "Identifier" ? node.callee.name : undefined;
}

/**
 * First pass:
 * collect bindings declared inside the callback.
 *
 * This must happen before reference extraction so
 * declaration order cannot affect the result.
 */
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

      case "ImportDeclaration":
        for (const specifier of node.specifiers) {
          bindings.add(specifier.local.name);
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

function collectDeclaredDependencies(
  array: TSESTree.ArrayExpression,
): Set<string> {
  const dependencies = new Set<string>();

  for (const element of array.elements) {
    if (element === null || element.type === "SpreadElement") {
      continue;
    }

    const name = getDependencyName(element);

    if (name && name !== "") {
      dependencies.add(name);
    }
  }

  return dependencies;
}

function collectBindingNames(node: TSESTree.Node, bindings: Set<string>): void {
  if (node.type === "Identifier") {
    bindings.add(node.name);
    return;
  }

  if (node.type === "AssignmentPattern") {
    collectBindingNames(node.left, bindings);
    return;
  }

  if (node.type === "RestElement") {
    collectBindingNames(node.argument, bindings);
    return;
  }

  if (node.type === "ArrayPattern") {
    for (const element of node.elements) {
      if (element !== null) {
        collectBindingNames(element, bindings);
      }
    }

    return;
  }

  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type === "RestElement") {
        collectBindingNames(property.argument, bindings);
        continue;
      }

      collectBindingNames(property.value, bindings);
    }
  }
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

function collectCapturedDependencies(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): string[] {
  const declared = collectLocalBindings(callback);
  const captured = new Set<string>();
  visitDependencyExpressions(callback.body, undefined, declared, captured);
  return [...captured].sort();
}
function visitDependencyExpressions(
  node: TSESTree.Node,
  parent: TSESTree.Node | undefined,
  declared: ReadonlySet<string>,
  captured: Set<string>,
): void {
  if (isDependencyExpression(node, parent)) {
    const name = getDependencyName(node);
    const root = getDependencyRoot(node);
    if (
      name !== undefined &&
      root !== undefined &&
      !declared.has(root) &&
      !GLOBAL_IDENTIFIERS.has(root) &&
      !GLOBAL_OBJECTS.has(root)
    ) {
      captured.add(name);
    }
    /* * Member expressions are atomic dependencies. * * user.name * -> collect "user.name" * * Never descend into: * user * name */ if (
      node.type === "MemberExpression"
    ) {
      return;
    }
  }
  for (const child of getChildNodes(node)) {
    visitDependencyExpressions(child, node, declared, captured);
  }
}
function isDependencyExpression(
  node: TSESTree.Node,
  parent: TSESTree.Node | undefined,
): boolean {
  if (node.type === "Identifier") {
    return isReferenceIdentifier(node, parent);
  }
  if (node.type === "MemberExpression") {
    return isReferenceMemberExpression(node, parent);
  }
  return false;
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
  if (parent.type === "FunctionDeclaration" && parent.id === node) {
    return false;
  }
  if (parent.type === "FunctionExpression" && parent.id === node) {
    return false;
  }
  if (parent.type === "ClassDeclaration" && parent.id === node) {
    return false;
  }
  if (parent.type === "ClassExpression" && parent.id === node) {
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
  // if (
  //   parent.type === "OptionalMemberExpression" &&
  //   parent.property === node &&
  //   !parent.computed
  // ) {
  //   return false;
  // }
  return true;
}
function isReferenceMemberExpression(
  node: TSESTree.MemberExpression,
  parent: TSESTree.Node | undefined,
): boolean {
  if (parent?.type === "VariableDeclarator") {
    return false;
  }
  if (parent?.type === "AssignmentExpression" && parent?.left === node) {
    return false;
  }
  if (
    node.object.type === "Identifier" &&
    GLOBAL_OBJECTS.has(node.object.name)
  ) {
    return false;
  }
  return true;
}
function getDependencyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "MemberExpression") {
    const object = getDependencyName(node.object);
    if (object === undefined) {
      return undefined;
    }
    if (!node.computed && node.property.type === "Identifier") {
      return `${object}.${node.property.name}`;
    }
    if (
      node.computed &&
      node.property.type === "Literal" &&
      typeof node.property.value === "string"
    ) {
      return `${object}.${node.property.value}`;
    }
    return object;
  }
  return undefined;
}
function getDependencyRoot(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "MemberExpression") {
    return getDependencyRoot(node.object);
  }
  return undefined;
}
