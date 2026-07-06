import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import { isNode } from "../../semantic/scope/scope-utils";

const TARGET_HOOKS = new Set(["useEffect", "useMemo", "useCallback"]);

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
]);

export const reactHooksMissingDepsRule: ReactRule = {
  id: "react.hooks.missing-deps",

  description:
    "Detect React hooks that capture render values missing from their dependency array.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "CallExpression") {
      return [];
    }

    const hook = context.hooks.hooks.find((item) => item.hook.node === node);

    if (hook === undefined || !TARGET_HOOKS.has(hook.hook.name)) {
      return [];
    }

    const callback = getCallback(node);

    if (callback === undefined) {
      return [];
    }

    const dependencies = getDependencyArray(node);

    if (dependencies === undefined) {
      return [];
    }

    const captured = collectCapturedDependencies(callback);

    const declared = collectDeclaredDependencies(dependencies);

    const missing = captured.filter((name) => !declared.has(name));

    if (missing.length === 0) {
      return [];
    }

    return [
      {
        id: [
          "react.hooks.missing-deps",
          context.file,
          hook.hook.location.line,
          hook.hook.location.column,
        ].join(":"),
        ruleId: "react.hooks.missing-deps",
        title: "Missing hook dependencies",
        message:
          `${hook.hook.name} is missing dependencies: ` +
          `${missing.join(", ")}.`,
        severity: "medium",
        source: "ast",
        location: {
          file: context.file,
          line: hook.hook.location.line,
          column: hook.hook.location.column,
        },
        suggestion: `Add ${missing.join(", ")} to the dependency array.`,
        confidence: 1,
      },
    ];
  },
};

function getCallback(
  node: TSESTree.CallExpression,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | undefined {
  const argument = node.arguments[0];

  if (argument === undefined) {
    return undefined;
  }

  if (
    argument.type === "ArrowFunctionExpression" ||
    argument.type === "FunctionExpression"
  ) {
    return argument;
  }

  return undefined;
}

function getDependencyArray(
  node: TSESTree.CallExpression,
): TSESTree.ArrayExpression | undefined {
  const argument = node.arguments[1];

  if (argument === undefined || argument.type !== "ArrayExpression") {
    return undefined;
  }

  return argument;
}

function collectCapturedDependencies(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): string[] {
  const declared = new Set<string>();

  for (const parameter of callback.params) {
    collectBindingNames(parameter, declared);
  }

  const captured = new Set<string>();

  visitNode(callback.body, (current) => {
    if (current.type === "VariableDeclarator") {
      collectBindingNames(current.id, declared);
      return;
    }

    if (current.type === "FunctionDeclaration" && current.id !== null) {
      declared.add(current.id.name);
      return;
    }

    if (current.type !== "Identifier") {
      return;
    }

    if (declared.has(current.name)) {
      return;
    }

    if (GLOBAL_IDENTIFIERS.has(current.name)) {
      return;
    }

    captured.add(current.name);
  });

  return [...captured].sort();
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

    if (name !== undefined) {
      dependencies.add(name);
    }
  }

  return dependencies;
}

function getDependencyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "MemberExpression" && node.object.type === "Identifier") {
    const property =
      node.property.type === "Identifier"
        ? node.property.name
        : node.property.type === "Literal" &&
            typeof node.property.value === "string"
          ? node.property.value
          : undefined;

    if (property !== undefined) {
      return `${node.object.name}.${property}`;
    }
  }

  return undefined;
}

function collectBindingNames(node: TSESTree.Node, names: Set<string>): void {
  if (node.type === "Identifier") {
    names.add(node.name);
    return;
  }

  if (node.type === "AssignmentPattern") {
    collectBindingNames(node.left, names);
    return;
  }

  if (node.type === "RestElement") {
    collectBindingNames(node.argument, names);
    return;
  }

  if (node.type === "ArrayPattern") {
    for (const element of node.elements) {
      if (element !== null) {
        collectBindingNames(element, names);
      }
    }

    return;
  }

  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type === "RestElement") {
        collectBindingNames(property.argument, names);
        continue;
      }

      collectBindingNames(property.value, names);
    }
  }
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
