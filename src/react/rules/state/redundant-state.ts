import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import {
  collectReferencedIdentifiers,
  collectStateBindings,
  expressionSignature,
} from "./semantic";

const RULE_ID = "react.state.redundant-state";

export const reactStateRedundantStateRule: ReactRule = {
  id: RULE_ID,
  description: "Detect multiple useState bindings representing the same derived source.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "VariableDeclarator") {
      return [];
    }

    const bindings = collectStateBindings(context.ast);
    const currentIndex = bindings.findIndex((item) => item.declaration === node);

    if (currentIndex < 0) {
      return [];
    }

    const current = bindings[currentIndex];
    const signature = expressionSignature(current?.initializer);

    if (current?.initializer === undefined || signature === undefined) {
      return [];
    }

    if (collectReferencedIdentifiers(current.initializer).size === 0) {
      return [];
    }

    const duplicate = bindings.slice(0, currentIndex).find(
      (item) => expressionSignature(item.initializer) === signature,
    );

    if (duplicate === undefined) {
      return [];
    }

    return [
      createFinding(
        node,
        context.file,
        current.stateName,
        duplicate.stateName,
      ),
    ];
  },
};

function createFinding(
  node: TSESTree.VariableDeclarator,
  file: string,
  stateName: string,
  duplicateName: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Redundant state source",
    message:
      `${stateName} duplicates the same derived source as ${duplicateName}, creating competing sources of truth.`,
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Keep one canonical state value and derive the duplicate value when rendering.",
    confidence: 0.88,
  };
}
