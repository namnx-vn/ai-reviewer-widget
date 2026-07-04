import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type ReactFunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

export function isIdentifier(
  node: TSESTree.Node | null | undefined,
): node is TSESTree.Identifier {
  return node?.type === "Identifier";
}

export function isPascalCaseName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

export function isFunctionLike(
  node: TSESTree.Node,
): node is ReactFunctionNode {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

export function getFunctionName(
  node: ReactFunctionNode,
): string | undefined {
  if (node.type === "FunctionDeclaration") {
    return node.id?.name;
  }

  if (node.type === "FunctionExpression") {
    return node.id?.name;
  }

  return undefined;
}

export function getVariableName(
  node: TSESTree.VariableDeclarator,
): string | undefined {
  return isIdentifier(node.id) ? node.id.name : undefined;
}

export function getCalleeName(
  node: TSESTree.CallExpression,
): string | undefined {
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

export function isJsxNode(
  node: TSESTree.Node,
): boolean {
  return (
    node.type === "JSXElement" ||
    node.type === "JSXFragment"
  );
}

/**
 * Performs a structural traversal over the ESTree produced by
 * @typescript-eslint/typescript-estree.
 *
 * The parser does not attach parent references, so traversal deliberately
 * ignores metadata that cannot be AST nodes.
 */
export function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, callback);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        visit(item, callback);
      }
    }
  }
}

function isNode(
  value: unknown,
): value is TSESTree.Node {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  if (!("type" in value)) {
    return false;
  }

  return typeof value.type === "string";
}