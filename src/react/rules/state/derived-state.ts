import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import { collectReferencedIdentifiers, collectStateBindings } from "./semantic";

const RULE_ID = "react.state.derived-state";

export const reactStateDerivedStateRule: ReactRule = {
  id: RULE_ID,
  description: "Detect useState values derived from existing React state.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "VariableDeclarator") {
      return [];
    }

    const bindings = collectStateBindings(context.ast);
    const binding = bindings.find((item) => item.declaration === node);

    if (binding?.initializer === undefined) {
      return [];
    }

    const otherStateNames = new Set(
      bindings
        .filter((item) => item.declaration !== node)
        .map((item) => item.stateName),
    );
    const references = collectReferencedIdentifiers(binding.initializer);
    const sourceState = [...references].find((name) => otherStateNames.has(name));

    if (sourceState === undefined) {
      return [];
    }

    return [createFinding(node, context.file, binding.stateName, sourceState)];
  },
};

function createFinding(
  node: TSESTree.VariableDeclarator,
  file: string,
  stateName: string,
  sourceState: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Derived value stored as state",
    message:
      `${stateName} is initialized from ${sourceState}. Keeping deterministic derived values in state creates another source of truth.`,
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Derive the value during render, or memoize an expensive pure calculation with useMemo when necessary.",
    confidence: 0.9,
  };
}
