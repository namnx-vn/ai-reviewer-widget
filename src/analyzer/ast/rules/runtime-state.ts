import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ASTRule } from "../rules";

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

interface NamedFunction {
  readonly name: string;
  readonly node: FunctionLike;
}

const NULLABLE_HYDRATION_RULE_ID = "quality.correctness.nullable-hydration-state";
const SEARCH_PARAM_KEY_RULE_ID = "quality.correctness.search-param-multivalue-key";

export const nullableHydrationStateRule: ASTRule = {
  id: NULLABLE_HYDRATION_RULE_ID,
  description:
    "Detect hydration helpers that dereference nullable state before a null guard.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (!isNode(node)) {
      return [];
    }

    const candidate = namedFunction(node);
    if (
      candidate === undefined ||
      !/hydrate|hydration/i.test(candidate.name) ||
      candidate.node.body.type !== "BlockStatement"
    ) {
      return [];
    }

    const findings: ReviewFinding[] = [];
    for (const parameter of candidate.node.params) {
      const parameterName = nullableParameterName(parameter);
      if (parameterName === undefined) {
        continue;
      }

      const unsafeAccess = findFirstUnsafeAccess(
        candidate.node.body,
        parameterName,
      );
      if (unsafeAccess !== undefined) {
        findings.push(createFinding(
          NULLABLE_HYDRATION_RULE_ID,
          file,
          unsafeAccess,
          "Nullable hydration state is dereferenced without a guard",
          "This hydration path accepts nullish state but dereferences it before proving that state is present.",
          "Guard nullish hydration state before reading fields, or use optional chaining from the nullable root value.",
        ));
      }
    }

    return findings;
  },
};

export const searchParamMultivalueKeyRule: ASTRule = {
  id: SEARCH_PARAM_KEY_RULE_ID,
  description:
    "Detect cache and routing keys that collapse repeated URLSearchParams values through Object.fromEntries.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (!isNode(node)) {
      return [];
    }

    const candidate = namedFunction(node);
    if (
      candidate === undefined ||
      !/(?:cache|key|segment|route|page)/i.test(candidate.name)
    ) {
      return [];
    }

    const matches: TSESTree.CallExpression[] = [];
    visit(candidate.node.body, (child) => {
      if (child.type === "CallExpression" && isSearchParamFromEntries(child)) {
        matches.push(child);
      }
    });

    return matches.map((match) => createFinding(
      SEARCH_PARAM_KEY_RULE_ID,
      file,
      match,
      "Repeated search parameters collapse in cache identity",
      "Object.fromEntries(new URLSearchParams(...)) keeps only one value per key, so repeated search parameters can collide with single-value cache or routing keys.",
      "Preserve repeated values with URLSearchParams entries/getAll semantics or encode the ordered parameter pairs directly into the key.",
    ));
  },
};

function namedFunction(node: TSESTree.Node): NamedFunction | undefined {
  if (node.type === "FunctionDeclaration" && node.id !== null) {
    return { name: node.id.name, node };
  }

  if (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    (node.init?.type === "ArrowFunctionExpression" ||
      node.init?.type === "FunctionExpression")
  ) {
    return { name: node.id.name, node: node.init };
  }

  return undefined;
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

function isNullishTest(
  node: TSESTree.Expression,
  parameterName: string,
): boolean {
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

function visit(
  node: TSESTree.Node,
  visitor: (node: TSESTree.Node) => void,
): void {
  visitor(node);

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, visitor);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        visit(item, visitor);
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
