import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";

const RULE_ID = "react.compiler.input-mutation";
const MUTATING_METHODS = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

type ComponentFunction =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

interface Mutation {
  readonly node: TSESTree.Node;
  readonly inputName: string;
}

export const reactCompilerInputMutationRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect render-time mutation of component inputs when React Compiler is enabled.",
  rollout: "advisory",

  check(node, context): ReviewFinding[] {
    if (
      node.type !== "Program" ||
      context.framework?.react.detected !== true ||
      context.framework?.react.compiler !== "enabled"
    ) {
      return [];
    }

    const findings: ReviewFinding[] = [];

    for (const component of context.hooks.components.components) {
      if (!isComponentFunction(component.node)) {
        continue;
      }

      const inputNames = collectInputNames(component.node.params);
      for (const mutation of collectRenderMutations(component.node, inputNames)) {
        findings.push(createFinding(mutation, context.file));
      }
    }

    return findings;
  },
};

function isComponentFunction(node: TSESTree.Node): node is ComponentFunction {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function collectInputNames(
  parameters: readonly TSESTree.Parameter[],
): ReadonlySet<string> {
  const names = new Set<string>();

  for (const parameter of parameters) {
    collectBindingNames(parameter, names);
  }

  return names;
}

function collectBindingNames(node: TSESTree.Node, names: Set<string>): void {
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
        collectBindingNames(
          property.type === "RestElement" ? property.argument : property.value,
          names,
        );
      }
      return;
    default:
      return;
  }
}

function collectRenderMutations(
  component: ComponentFunction,
  inputNames: ReadonlySet<string>,
): readonly Mutation[] {
  const mutations: Mutation[] = [];

  visitRenderNode(component.body, inputNames, mutations);

  return mutations;
}

function visitRenderNode(
  node: TSESTree.Node,
  inputNames: ReadonlySet<string>,
  output: Mutation[],
): void {
  if (isComponentFunction(node)) {
    return;
  }

  const inputName = getMutatedInput(node, inputNames);
  if (inputName !== undefined) {
    output.push({ node, inputName });
  }

  for (const child of getChildNodes(node)) {
    visitRenderNode(child, inputNames, output);
  }
}

function getMutatedInput(
  node: TSESTree.Node,
  inputNames: ReadonlySet<string>,
): string | undefined {
  if (
    node.type === "AssignmentExpression" &&
    node.left.type === "MemberExpression"
  ) {
    return getInputRoot(node.left, inputNames);
  }

  if (
    node.type === "UpdateExpression" &&
    node.argument.type === "MemberExpression"
  ) {
    return getInputRoot(node.argument, inputNames);
  }

  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    MUTATING_METHODS.has(node.callee.property.name)
  ) {
    return getInputRoot(node.callee.object, inputNames);
  }

  return undefined;
}

function getInputRoot(
  node: TSESTree.Node,
  inputNames: ReadonlySet<string>,
): string | undefined {
  if (node.type === "Identifier") {
    return inputNames.has(node.name) ? node.name : undefined;
  }

  return node.type === "MemberExpression"
    ? getInputRoot(node.object, inputNames)
    : undefined;
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

function createFinding(mutation: Mutation, file: string): ReviewFinding {
  const line = mutation.node.loc?.start.line ?? 1;
  const column = mutation.node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Render mutates a component input",
    message:
      `${mutation.inputName} is a component input mutated during render. ` +
      "React Compiler is enabled, and render-time input mutation violates the purity needed for safe optimization.",
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      `Create a new value derived from ${mutation.inputName} instead of mutating the input.`,
    confidence: 1,
  };
}
