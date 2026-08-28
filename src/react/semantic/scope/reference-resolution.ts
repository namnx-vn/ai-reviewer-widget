import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { Reference } from "./scope-types";
import {
  getLocation,
  type DeclarationInput,
  type MutableScope,
} from "./scope-utils";

export function addReference(
  node: TSESTree.Identifier,
  scope: MutableScope,
  isWrite: boolean,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  const declaration = resolveDeclaration(scope, node.name, declarations);

  const reference: Reference = {
    name: node.name,
    node,
    location: getLocation(node),
    isWrite,
    scopeId: scope.id,
    declaration:
      declaration === undefined
        ? undefined
        : {
            ...declaration,
            scopeId: scope.id,
          },
  };

  scope.references.push({
    name: reference.name,
    node: reference.node,
    location: reference.location,
    isWrite: reference.isWrite,
  });

  references.push(reference);
}

function resolveDeclaration(
  scope: MutableScope,
  name: string,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
): DeclarationInput | undefined {
  let current: MutableScope | undefined = scope;

  while (current !== undefined) {
    const local = current.declarations.find(
      (declaration) => declaration.name === name,
    );

    if (local !== undefined) {
      return local;
    }

    current = findParentScope(current, scope);
  }

  const global = declarations.get(name);

  return global?.[0];
}

function findParentScope(
  scope: MutableScope,
  root: MutableScope,
): MutableScope | undefined {
  if (scope.parentId === undefined) {
    return undefined;
  }

  return findScopeById(root, scope.parentId);
}

function findScopeById(
  scope: MutableScope,
  id: number,
): MutableScope | undefined {
  if (scope.id === id) {
    return scope;
  }

  for (const child of scope.children) {
    const found = findScopeById(child, id);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}
