import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";

const RULE_ID = "react.state.module-shared-instance-state";

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

interface NamedFunction {
  readonly name: string;
  readonly node: FunctionLike;
}

export const reactStateModuleSharedInstanceRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect React instance state mirrored through mutable module variables that can leak across multiple mounted instances.",

  check(node, context): ReviewFinding[] {
    if (node.type !== "Program") {
      return [];
    }

    const mutableModuleNames = collectMutableModuleNames(node);
    if (mutableModuleNames.size === 0) {
      return [];
    }

    const findings: ReviewFinding[] = [];
    for (const candidate of collectTopLevelFunctions(node)) {
      if (!isReactInstanceFunction(candidate.name)) {
        continue;
      }

      for (const moduleName of mutableModuleNames) {
        if (
          initializesStateFrom(candidate.node.body, moduleName) &&
          mutatesIdentifier(candidate.node.body, moduleName)
        ) {
          findings.push(createFinding(
            context.file,
            candidate.node,
            moduleName,
          ));
        }
      }
    }

    return findings;
  },
};

function collectMutableModuleNames(program: TSESTree.Program): ReadonlySet<string> {
  const names = new Set<string>();

  for (const statement of program.body) {
    if (statement.type !== "VariableDeclaration" || statement.kind === "const") {
      continue;
    }

    for (const declaration of statement.declarations) {
      if (declaration.id.type === "Identifier") {
        names.add(declaration.id.name);
      }
    }
  }

  return names;
}

function collectTopLevelFunctions(program: TSESTree.Program): readonly NamedFunction[] {
  const functions: NamedFunction[] = [];

  for (const statement of program.body) {
    if (statement.type === "FunctionDeclaration" && statement.id !== null) {
      functions.push({ name: statement.id.name, node: statement });
      continue;
    }

    if (statement.type !== "VariableDeclaration") {
      continue;
    }

    for (const declaration of statement.declarations) {
      if (
        declaration.id.type === "Identifier" &&
        (declaration.init?.type === "ArrowFunctionExpression" ||
          declaration.init?.type === "FunctionExpression")
      ) {
        functions.push({ name: declaration.id.name, node: declaration.init });
      }
    }
  }

  return functions;
}

function isReactInstanceFunction(name: string): boolean {
  return /^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name);
}

function initializesStateFrom(node: TSESTree.Node, moduleName: string): boolean {
  let found = false;

  visit(node, (child) => {
    if (
      child.type !== "VariableDeclarator" ||
      child.id.type !== "ArrayPattern" ||
      child.init?.type !== "CallExpression" ||
      callName(child.init) !== "useState"
    ) {
      return;
    }

    const initializer = child.init.arguments[0];
    if (
      initializer?.type === "Identifier" &&
      initializer.name === moduleName
    ) {
      found = true;
    }
  });

  return found;
}

function mutatesIdentifier(node: TSESTree.Node, moduleName: string): boolean {
  let found = false;

  visit(node, (child) => {
    if (
      child.type === "AssignmentExpression" &&
      child.left.type === "Identifier" &&
      child.left.name === moduleName
    ) {
      found = true;
      return;
    }

    if (
      child.type === "UpdateExpression" &&
      child.argument.type === "Identifier" &&
      child.argument.name === moduleName
    ) {
      found = true;
    }
  });

  return found;
}

function callName(node: TSESTree.CallExpression): string | undefined {
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

function createFinding(
  file: string,
  node: TSESTree.Node,
  moduleName: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column, moduleName].join(":"),
    ruleId: RULE_ID,
    title: "Mutable module state leaks across React instances",
    message:
      `${moduleName} initializes component state and is also mutated by the same component. Multiple mounted instances therefore share one mutable backing value and can interfere with each other.`,
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Keep instance-owned state in React state/context, or use an explicit external-store abstraction with per-provider isolation.",
    confidence: 0.99,
  };
}

function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void {
  visitor(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, visitor);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          visit(item, visitor);
        }
      }
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}
