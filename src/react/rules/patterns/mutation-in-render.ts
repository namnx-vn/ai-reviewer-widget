import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { visit } from "../../ast/component-utils";
import type { ReviewFinding } from "../../../domain/review";
import type { ReactRuleContext } from "../../engine/react-rule";
import type { ReactRule } from "../../engine/react-rule";
import type { ComponentMetadata } from "../../semantic/component-analyzer";
import {
  findEnclosingComponent,
  isRenderPhaseNode,
} from "../performance/semantic";
import { getReactQueryApiName } from "./library-context";

const RULE_ID = "react.patterns.mutation-in-render";

interface MutationBindings {
  readonly mutationObjects: ReadonlySet<string>;
  readonly mutateFunctions: ReadonlySet<string>;
}

const mutationCache = new WeakMap<TSESTree.Node, MutationBindings>();

export const reactPatternsMutationInRenderRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect React Query mutations executed directly during component render.",

  check(node, context) {
    if (
      node.type !== "CallExpression" ||
      !isRenderPhaseNode(node, context)
    ) {
      return [];
    }

    const component = findEnclosingComponent(node, context);

    if (component === undefined) {
      return [];
    }

    const bindings = getMutationBindings(context, component);

    return isDirectMutateCall(node, bindings)
      ? [createFinding(context.file, node)]
      : [];
  },
};

function getMutationBindings(
  context: ReactRuleContext,
  component: ComponentMetadata,
): MutationBindings {
  const cached = mutationCache.get(component.node);

  if (cached !== undefined) {
    return cached;
  }

  const mutationObjects = new Set<string>();
  const mutateFunctions = new Set<string>();

  visit(component.node, (node) => {
    if (
      findEnclosingComponent(node, context) !== component ||
      node.type !== "VariableDeclarator" ||
      node.init?.type !== "CallExpression" ||
      getReactQueryApiName(node.init, context) !== "useMutation"
    ) {
      return;
    }

    if (node.id.type === "Identifier") {
      mutationObjects.add(node.id.name);
      return;
    }

    if (node.id.type !== "ObjectPattern") {
      return;
    }

    for (const property of node.id.properties) {
      if (
        property.type !== "Property" ||
        property.computed ||
        getPropertyName(property.key) !== "mutate"
      ) {
        continue;
      }

      collectBindingName(property.value, mutateFunctions);
    }
  });

  const result: MutationBindings = {
    mutationObjects,
    mutateFunctions,
  };

  mutationCache.set(component.node, result);

  return result;
}

function isDirectMutateCall(
  node: TSESTree.CallExpression,
  bindings: MutationBindings,
): boolean {
  if (
    node.callee.type === "Identifier" &&
    bindings.mutateFunctions.has(node.callee.name)
  ) {
    return true;
  }

  return (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    bindings.mutationObjects.has(node.callee.object.name) &&
    node.callee.property.type === "Identifier" &&
    (node.callee.property.name === "mutate" ||
      node.callee.property.name === "mutateAsync")
  );
}

function collectBindingName(
  node: TSESTree.Node,
  names: Set<string>,
): void {
  if (node.type === "Identifier") {
    names.add(node.name);
    return;
  }

  if (
    node.type === "AssignmentPattern" &&
    node.left.type === "Identifier"
  ) {
    names.add(node.left.name);
  }
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
    title: "React Query mutation executed during render",
    message:
      "This mutation is invoked in the component render path, which can repeat the side effect whenever React renders the component.",
    severity: "high",
    source: "ast",
    location: {
      file,
      line: node.loc?.start.line ?? 1,
      column: node.loc?.start.column ?? 0,
    },
    suggestion:
      "Invoke the mutation from an event handler, transition callback, or effect tied to an explicit state change.",
    confidence: 0.99,
  };
}
