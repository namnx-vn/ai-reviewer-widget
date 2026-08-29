import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRuleContext } from "../../engine/react-rule";
import type { ReactRule } from "../../engine/react-rule";
import type { ComponentMetadata } from "../../semantic/component-analyzer";

const RULE_ID = "react.patterns.nested-component-definition";

export const reactPatternsNestedComponentDefinitionRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect React components declared inside another component render scope.",

  check(node, context) {
    const component = getComponentForNode(node, context);

    if (component === undefined) {
      return [];
    }

    const parent = findContainingComponent(component, context);

    if (parent === undefined) {
      return [];
    }

    return [
      createFinding(
        context.file,
        component,
        parent,
      ),
    ];
  },
};

function getComponentForNode(
  node: TSESTree.Node,
  context: ReactRuleContext,
): ComponentMetadata | undefined {
  return context.hooks.components.components.find(
    (component) => component.node === node,
  );
}

function findContainingComponent(
  target: ComponentMetadata,
  context: ReactRuleContext,
): ComponentMetadata | undefined {
  let result: ComponentMetadata | undefined;

  for (const candidate of context.hooks.components.components) {
    if (
      candidate === target ||
      !strictlyContains(candidate.node, target.node)
    ) {
      continue;
    }

    if (
      result === undefined ||
      getRangeSize(candidate.node) < getRangeSize(result.node)
    ) {
      result = candidate;
    }
  }

  return result;
}

function strictlyContains(
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
    parentStart < childStart &&
    childEnd < parentEnd
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

function createFinding(
  file: string,
  component: ComponentMetadata,
  parent: ComponentMetadata,
): ReviewFinding {
  return {
    id: [
      RULE_ID,
      file,
      component.location.line,
      component.location.column,
    ].join(":"),
    ruleId: RULE_ID,
    title: "Component defined during parent render",
    message:
      `Component ${component.name} is declared inside ${parent.name}, so React receives a new component type whenever the parent renders and can remount the nested subtree.`,
    severity: "high",
    source: "ast",
    location: {
      file,
      line: component.location.line,
      column: component.location.column,
    },
    suggestion:
      `Move ${component.name} to module scope and pass required data through props instead of redefining the component inside ${parent.name}.`,
    confidence: 0.99,
  };
}
