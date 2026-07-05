import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type JSXElementKind = "intrinsic" | "component";

export interface JSXElementName {
  readonly name: string;
  readonly kind: JSXElementKind;
}

export function isJSXElement(
  node: TSESTree.Node,
): node is TSESTree.JSXElement {
  return node.type === "JSXElement";
}

export function isJSXFragment(
  node: TSESTree.Node,
): node is TSESTree.JSXFragment {
  return node.type === "JSXFragment";
}

export function isJSXAttribute(
  node: TSESTree.Node,
): node is TSESTree.JSXAttribute {
  return node.type === "JSXAttribute";
}

export function isJSXExpressionContainer(
  node: TSESTree.Node,
): node is TSESTree.JSXExpressionContainer {
  return node.type === "JSXExpressionContainer";
}

export function isJSXIdentifier(
  node: TSESTree.Node | null | undefined,
): node is TSESTree.JSXIdentifier {
  return node?.type === "JSXIdentifier";
}

export function isJSXMemberExpression(
  node: TSESTree.Node | null | undefined,
): node is TSESTree.JSXMemberExpression {
  return node?.type === "JSXMemberExpression";
}

export function isJSXNamespacedName(
  node: TSESTree.Node | null | undefined,
): node is TSESTree.JSXNamespacedName {
  return node?.type === "JSXNamespacedName";
}

export function getJSXElementName(
  node: TSESTree.JSXOpeningElement,
): JSXElementName | undefined {
  const name = getJSXName(node.name);

  if (name === undefined) {
    return undefined;
  }

  return {
    name,
    kind: isIntrinsicJSXName(name)
      ? "intrinsic"
      : "component",
  };
}

export function getJSXName(
  node:
    | TSESTree.JSXIdentifier
    | TSESTree.JSXMemberExpression
    | TSESTree.JSXNamespacedName,
): string | undefined {
  if (isJSXIdentifier(node)) {
    return node.name;
  }

  if (isJSXMemberExpression(node)) {
    const objectName = getJSXName(node.object);
    const propertyName = getJSXName(node.property);

    if (
      objectName === undefined ||
      propertyName === undefined
    ) {
      return undefined;
    }

    return `${objectName}.${propertyName}`;
  }

  if (isJSXNamespacedName(node)) {
    const namespace = getJSXName(node.namespace);
    const name = getJSXName(node.name);

    if (
      namespace === undefined ||
      name === undefined
    ) {
      return undefined;
    }

    return `${namespace}:${name}`;
  }

  return undefined;
}

export function isIntrinsicJSXName(
  name: string,
): boolean {
  const firstCharacter = name[0];

  if (firstCharacter === undefined) {
    return false;
  }

  return (
    firstCharacter === firstCharacter.toLowerCase()
  );
}

export function getJSXAttributeName(
  attribute: TSESTree.JSXAttribute,
): string | undefined {
  return getJSXName(attribute.name);
}

export function hasJSXAttribute(
  element: TSESTree.JSXOpeningElement,
  attributeName: string,
): boolean {
  return element.attributes.some(
    (attribute) =>
      attribute.type === "JSXAttribute" &&
      getJSXAttributeName(attribute) ===
        attributeName,
  );
}

export function getJSXAttribute(
  element: TSESTree.JSXOpeningElement,
  attributeName: string,
): TSESTree.JSXAttribute | undefined {
  return element.attributes.find(
    (
      attribute,
    ): attribute is TSESTree.JSXAttribute =>
      attribute.type === "JSXAttribute" &&
      getJSXAttributeName(attribute) ===
        attributeName,
  );
}

export function isJSXSpreadAttribute(
  attribute: TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute,
): attribute is TSESTree.JSXSpreadAttribute {
  return attribute.type === "JSXSpreadAttribute";
}

export function isJSXEventHandlerName(
  name: string,
): boolean {
  return /^on[A-Z]/.test(name);
}

export function getJSXEventHandlerNames(
  element: TSESTree.JSXOpeningElement,
): readonly string[] {
  return element.attributes
    .filter(
      (
        attribute,
      ): attribute is TSESTree.JSXAttribute =>
        attribute.type === "JSXAttribute",
    )
    .map(getJSXAttributeName)
    .filter(
      (
        name,
      ): name is string =>
        name !== undefined &&
        isJSXEventHandlerName(name),
    );
}

export function getJSXKeyAttribute(
  element: TSESTree.JSXOpeningElement,
): TSESTree.JSXAttribute | undefined {
  return getJSXAttribute(
    element,
    "key",
  );
}

export function hasJSXKey(
  element: TSESTree.JSXOpeningElement,
): boolean {
  return (
    getJSXKeyAttribute(element) !==
    undefined
  );
}

export function getJSXChildren(
  element: TSESTree.JSXElement,
): readonly TSESTree.JSXChild[] {
  return element.children;
}

export function getJSXExpression(
  attribute: TSESTree.JSXAttribute,
): TSESTree.Expression | null | undefined {
  const value = attribute.value;

  if (
    value === null ||
    value.type !== "JSXExpressionContainer"
  ) {
    return undefined;
  }

  if (
    value.expression.type ===
    "JSXEmptyExpression"
  ) {
    return null;
  }

  return value.expression;
}