import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  getJSXAttributeName,
  getJSXChildren,
  getJSXElementName,
  getJSXEventHandlerNames,
  getJSXKeyAttribute,
  getMeaningfulJSXChildren,
  isJSXElement,
  isJSXFragment,
  isJSXSpreadAttribute,
  type JSXElementKind,
} from "../ast/jsx-utils";

export interface JSXLocation {
  readonly line: number;
  readonly column: number;
}

export interface JSXAttributeMetadata {
  readonly name?: string;
  readonly isSpread: boolean;
  readonly hasValue: boolean;
  readonly node:
    | TSESTree.JSXAttribute
    | TSESTree.JSXSpreadAttribute;
}

export interface JSXElementMetadata {
  readonly name: string;
  readonly kind: JSXElementKind;
  readonly node: TSESTree.JSXElement;
  readonly openingElement: TSESTree.JSXOpeningElement;
  readonly location: JSXLocation;
  readonly attributes: readonly JSXAttributeMetadata[];
  readonly eventHandlers: readonly string[];
  readonly hasKey: boolean;
  readonly childCount: number;
  readonly hasChildren: boolean;
}

export interface JSXFragmentMetadata {
  readonly node: TSESTree.JSXFragment;
  readonly location: JSXLocation;
  readonly childCount: number;
  readonly hasChildren: boolean;
}

export interface JSXAnalysisResult {
  readonly elements: readonly JSXElementMetadata[];
  readonly fragments: readonly JSXFragmentMetadata[];
}

export function analyzeJSX(
  ast: TSESTree.Program,
): JSXAnalysisResult {
  const elements: JSXElementMetadata[] = [];
  const fragments: JSXFragmentMetadata[] = [];

  visit(ast, (node) => {
    if (isJSXElement(node)) {
      const metadata =
        createElementMetadata(node);

      if (metadata !== undefined) {
        elements.push(metadata);
      }

      return;
    }

    if (isJSXFragment(node)) {
      fragments.push(
        createFragmentMetadata(node),
      );
    }
  });

  return {
    elements,
    fragments,
  };
}

function createElementMetadata(
  node: TSESTree.JSXElement,
): JSXElementMetadata | undefined {
  const name = getJSXElementName(
    node.openingElement,
  );

  if (name === undefined) {
    return undefined;
  }

  const children = getJSXChildren(node);

  return {
    name: name.name,
    kind: name.kind,
    node,
    openingElement: node.openingElement,
    location: getLocation(node),
    attributes:
      getAttributeMetadata(
        node.openingElement,
      ),
    eventHandlers:
      getJSXEventHandlerNames(
        node.openingElement,
      ),
    hasKey:
      getJSXKeyAttribute(
        node.openingElement,
      ) !== undefined,
    childCount: children.length,
    hasChildren: children.length > 0,
  };
}

function createFragmentMetadata(
  node: TSESTree.JSXFragment,
): JSXFragmentMetadata {
    const children = getMeaningfulJSXChildren(node.children);
  const childCount = children.length;

  return {
    node,
    location: getLocation(node),
    childCount,
    hasChildren: childCount > 0,
  };
}

function getAttributeMetadata(
  element: TSESTree.JSXOpeningElement,
): readonly JSXAttributeMetadata[] {
  return element.attributes.map(
    (attribute): JSXAttributeMetadata => {
      if (
        isJSXSpreadAttribute(attribute)
      ) {
        return {
          isSpread: true,
          hasValue: true,
          node: attribute,
        };
      }

      return {
        name: getJSXAttributeName(attribute),
        isSpread: false,
        hasValue: attribute.value !== null,
        node: attribute,
      };
    },
  );
}

function visit(
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

  return (
    typeof value.type === "string"
  );
}

function getLocation(
  node: TSESTree.Node,
): JSXLocation {
  return {
    line: node.loc?.start.line ?? 1,
    column: node.loc?.start.column ?? 0,
  };
}