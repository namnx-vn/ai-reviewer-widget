import type { TSESTree } from "@typescript-eslint/typescript-estree";

export interface StateBinding {
  readonly stateName: string;
  readonly setterName: string;
  readonly declaration: TSESTree.VariableDeclarator;
  readonly initializer?: TSESTree.Expression;
}

export function collectStateBindings(ast: TSESTree.Program): readonly StateBinding[] {
  const bindings: StateBinding[] = [];

  visit(ast, (node) => {
    if (node.type !== "VariableDeclarator" || node.id.type !== "ArrayPattern") {
      return;
    }

    if (node.init?.type !== "CallExpression" || !isUseStateCall(node.init)) {
      return;
    }

    const state = node.id.elements[0];
    const setter = node.id.elements[1];

    if (state?.type !== "Identifier" || setter?.type !== "Identifier") {
      return;
    }

    const initializer = node.init.arguments[0];

    bindings.push({
      stateName: state.name,
      setterName: setter.name,
      declaration: node,
      initializer:
        initializer !== undefined && initializer.type !== "SpreadElement"
          ? initializer
          : undefined,
    });
  });

  return bindings;
}

export function isUseEffectCall(node: TSESTree.CallExpression): boolean {
  return getCallName(node) === "useEffect";
}

export function getCallName(node: TSESTree.CallExpression): string | undefined {
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

export function getRootIdentifier(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "MemberExpression") {
    return getRootIdentifier(node.object);
  }

  return undefined;
}

export function collectReferencedIdentifiers(node: TSESTree.Node): ReadonlySet<string> {
  const names = new Set<string>();

  visit(node, (child) => {
    if (child.type === "Identifier") {
      names.add(child.name);
    }
  });

  return names;
}

export function expressionSignature(node: TSESTree.Node | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  switch (node.type) {
    case "Identifier":
      return `id:${node.name}`;
    case "Literal":
      return `literal:${String(node.value)}`;
    case "MemberExpression": {
      const object = expressionSignature(node.object);
      const property = expressionSignature(node.property);
      return object !== undefined && property !== undefined
        ? `member:${object}:${property}:${node.computed ? "computed" : "direct"}`
        : undefined;
    }
    case "BinaryExpression":
    case "LogicalExpression": {
      const left = expressionSignature(node.left);
      const right = expressionSignature(node.right);
      return left !== undefined && right !== undefined
        ? `${node.type}:${node.operator}:${left}:${right}`
        : undefined;
    }
    case "UnaryExpression": {
      const argument = expressionSignature(node.argument);
      return argument !== undefined
        ? `unary:${node.operator}:${argument}`
        : undefined;
    }
    case "ConditionalExpression": {
      const test = expressionSignature(node.test);
      const consequent = expressionSignature(node.consequent);
      const alternate = expressionSignature(node.alternate);
      return test !== undefined && consequent !== undefined && alternate !== undefined
        ? `conditional:${test}:${consequent}:${alternate}`
        : undefined;
    }
    default:
      return undefined;
  }
}

export function getChildNodes(node: TSESTree.Node): TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        children.push(item);
      }
    }
  }

  return children;
}

export function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

function isUseStateCall(node: TSESTree.CallExpression): boolean {
  return getCallName(node) === "useState";
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}
