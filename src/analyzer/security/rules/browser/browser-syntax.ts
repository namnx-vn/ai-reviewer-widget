import type { TSESTree } from "@typescript-eslint/typescript-estree";

export function argumentAt(
  node: TSESTree.CallExpression,
  index: number,
): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : argument;
}

export function normalizeAttributeName(value: string): string {
  return value === "formaction" ? "formAction" : value.toLowerCase();
}

export function isJavascriptUrl(node: TSESTree.Node): boolean {
  const value = staticString(node);
  return (
    value !== undefined &&
    value.trimStart().toLowerCase().startsWith("javascript:")
  );
}

export function staticString(node: TSESTree.Node): string | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Literal") {
    return typeof expression.value === "string" ? expression.value : undefined;
  }

  if (
    expression.type === "TemplateLiteral" &&
    expression.expressions.length === 0
  ) {
    return expression.quasis
      .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
      .join("");
  }

  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    const left = staticString(expression.left);
    const right = staticString(expression.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }

  return undefined;
}

export function memberPath(node: TSESTree.Node): readonly string[] | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Identifier") {
    return [expression.name];
  }
  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const object = memberPath(expression.object);
  const property = propertyName(expression.property, expression.computed);
  return object === undefined || property === undefined
    ? undefined
    : [...object, property];
}

export function propertyName(
  node: TSESTree.Node,
  computed: boolean,
): string | undefined {
  if (!computed && node.type === "Identifier") {
    return node.name;
  }
  return stringLiteralValue(node);
}

export function nodeName(node: TSESTree.Node): string | undefined {
  return node.type === "Identifier" ? node.name : stringLiteralValue(node);
}

export function stringLiteralValue(node: TSESTree.Node): string | undefined {
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}

export function unwrapChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === "ChainExpression" ? node.expression : node;
}

export function isFunction(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration {
  return (
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration"
  );
}

export function visit(
  node: TSESTree.Node,
  visitor: (node: TSESTree.Node) => void,
): void {
  visitor(node);

  const children: TSESTree.Node[] = [];
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    }
  }

  children.sort(
    (left, right) =>
      (left.range?.[0] ?? Number.MAX_SAFE_INTEGER) -
      (right.range?.[0] ?? Number.MAX_SAFE_INTEGER),
  );

  for (const child of children) {
    visit(child, visitor);
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
