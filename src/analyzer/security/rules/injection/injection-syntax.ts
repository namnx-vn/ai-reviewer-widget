import type { TSESTree } from "@typescript-eslint/typescript-estree";

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
