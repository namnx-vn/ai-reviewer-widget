import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import { visit } from "../../ast/component-utils";
import type { ReactRule } from "../../engine/react-rule";

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

const NULLABLE_HYDRATION_RULE_ID = "react.patterns.nullable-hydration-state";
const SEARCH_PARAM_KEY_RULE_ID = "react.patterns.search-param-multivalue-key";

export const reactPatternsNullableHydrationStateRule: ReactRule = {
  id: NULLABLE_HYDRATION_RULE_ID,
  description:
    "Detect hydration helpers that dereference nullable state before a null guard.",

  check(node, context) {
    if (node.type !== "Program") {
      return [];
    }

    return findNullableHydrationAccesses(node).map((match) =>
      createFinding(
        NULLABLE_HYDRATION_RULE_ID,
        context.file,
        match,
        "Nullable hydration state is dereferenced without a guard",
        "This hydration path accepts nullish state but dereferences it before proving that state is present.",
        "Guard nullish hydration state before reading fields, or use optional chaining from the nullable root value.",
      ),
    );
  },
};

export const reactPatternsSearchParamMultivalueKeyRule: ReactRule = {
  id: SEARCH_PARAM_KEY_RULE_ID,
  description:
    "Detect cache and routing keys that collapse repeated URLSearchParams values through Object.fromEntries.",

  check(node, context) {
    if (node.type !== "Program") {
      return [];
    }

    return findSearchParamKeyCollapses(node).map((match) =>
      createFinding(
        SEARCH_PARAM_KEY_RULE_ID,
        context.file,
        match,
        "Repeated search parameters collapse in cache identity",
        "Object.fromEntries(new URLSearchParams(...)) keeps only one value per key, so repeated search parameters can collide with single-value cache or routing keys.",
        "Preserve repeated values with URLSearchParams entries/getAll semantics or encode the ordered parameter pairs directly into the key.",
      ),
    );
  },
};

function findNullableHydrationAccesses(
  ast: TSESTree.Program,
): readonly TSESTree.MemberExpression[] {
  const matches: TSESTree.MemberExpression[] = [];

  visitNamedFunctions(ast, (name, node) => {
    if (!/hydrate|hydration/i.test(name) || node.body.type !== "BlockStatement") {
      return;
    }

    for (const parameter of node.params) {
      const parameterName = nullableParameterName(parameter);
      if (parameterName === undefined) {
        continue;
      }

      const match = findFirstUnsafeAccess(node.body, parameterName);
      if (match !== undefined) {
        matches.push(match);
      }
    }
  });

  return matches;
}

function findFirstUnsafeAccess(
  body: TSESTree.BlockStatement,
  parameterName: string,
): TSESTree.MemberExpression | undefined {
  for (const statement of body.body) {
    if (isTerminatingNullGuard(statement, parameterName)) {
      return undefined;
    }

    let unsafe: TSESTree.MemberExpression | undefined;
    visit(statement, (node) => {
      if (
        unsafe === undefined &&
        node.type === "MemberExpression" &&
        node.object.type === "Identifier" &&
        node.object.name === parameterName &&
        node.optional !== true
      ) {
        unsafe = node;
      }
    });

    if (unsafe !== undefined) {
      return unsafe;
    }
  }

  return undefined;
}

function nullableParameterName(parameter: TSESTree.Node): string | undefined {
  if (parameter.type !== "Identifier") {
    return undefined;
  }

  if (parameter.optional === true) {
    return parameter.name;
  }

  const typeNode = parameter.typeAnnotation?.typeAnnotation;
  if (typeNode === undefined || !typeContainsNullish(typeNode)) {
    return undefined;
  }

  return parameter.name;
}

function typeContainsNullish(node: TSESTree.Node): boolean {
  let found = false;

  visit(node, (child) => {
    if (child.type === "TSNullKeyword" || child.type === "TSUndefinedKeyword") {
      found = true;
    }
  });

  return found;
}

function isTerminatingNullGuard(
  statement: TSESTree.Statement,
  parameterName: string,
): boolean {
  if (
    statement.type !== "IfStatement" ||
    !isNullishTest(statement.test, parameterName)
  ) {
    return false;
  }

  return statementTerminates(statement.consequent);
}

function isNullishTest(node: TSESTree.Expression, parameterName: string): boolean {
  if (
    node.type === "UnaryExpression" &&
    node.operator === "!" &&
    node.argument.type === "Identifier" &&
    node.argument.name === parameterName
  ) {
    return true;
  }

  if (node.type !== "BinaryExpression") {
    return false;
  }

  if (node.operator !== "==" && node.operator !== "===") {
    return false;
  }

  return (
    (isNamedIdentifier(node.left, parameterName) && isNullishLiteral(node.right)) ||
    (isNamedIdentifier(node.right, parameterName) && isNullishLiteral(node.left))
  );
}

function isNamedIdentifier(node: TSESTree.Node, name: string): boolean {
  return node.type === "Identifier" && node.name === name;
}

function isNullishLiteral(node: TSESTree.Node): boolean {
  return (
    (node.type === "Literal" && node.value === null) ||
    (node.type === "Identifier" && node.name === "undefined")
  );
}

function statementTerminates(statement: TSESTree.Statement): boolean {
  if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") {
    return true;
  }

  if (statement.type !== "BlockStatement") {
    return false;
  }

  return statement.body.some((child) =>
    child.type === "ReturnStatement" || child.type === "ThrowStatement",
  );
}

function findSearchParamKeyCollapses(
  ast: TSESTree.Program,
): readonly TSESTree.CallExpression[] {
  const matches: TSESTree.CallExpression[] = [];

  visitNamedFunctions(ast, (name, node) => {
    if (!/(?:cache|key|segment|route|page)/i.test(name)) {
      return;
    }

    visit(node.body, (child) => {
      if (child.type === "CallExpression" && isSearchParamFromEntries(child)) {
        matches.push(child);
      }
    });
  });

  return matches;
}

function isSearchParamFromEntries(node: TSESTree.CallExpression): boolean {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.object.type !== "Identifier" ||
    node.callee.object.name !== "Object" ||
    node.callee.property.type !== "Identifier" ||
    node.callee.property.name !== "fromEntries"
  ) {
    return false;
  }

  const entries = node.arguments[0];
  return (
    entries?.type === "NewExpression" &&
    entries.callee.type === "Identifier" &&
    entries.callee.name === "URLSearchParams"
  );
}

function visitNamedFunctions(
  ast: TSESTree.Program,
  callback: (name: string, node: FunctionLike) => void,
): void {
  visit(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id !== null) {
      callback(node.id.name, node);
      return;
    }

    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression")
    ) {
      callback(node.id.name, node.init);
    }
  });
}

function createFinding(
  ruleId: string,
  file: string,
  node: TSESTree.Node,
  title: string,
  message: string,
  suggestion: string,
): ReviewFinding {
  return {
    id: [
      ruleId,
      file,
      node.loc?.start.line ?? 1,
      node.loc?.start.column ?? 0,
    ].join(":"),
    ruleId,
    title,
    message,
    severity: "medium",
    source: "ast",
    location: {
      file,
      line: node.loc?.start.line ?? 1,
      column: node.loc?.start.column ?? 0,
    },
    suggestion,
    confidence: 0.99,
  };
}
