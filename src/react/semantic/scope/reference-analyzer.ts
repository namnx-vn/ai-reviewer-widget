import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  getChildNodes,
  getLocation,
  isReferenceIdentifier,
  findScopeForNode,
  type MutableScope,
} from "./scope-utils";
import type { DeclarationInput } from "./scope-utils";
import type { ScopeBuildResult } from "./scope-builder";
import type { Reference } from "./scope-types";

export interface ReferenceAnalysisResult {
  readonly references: readonly Reference[];
}

export function analyzeReferences(
  ast: TSESTree.Program,
  scopeBuild: ScopeBuildResult,
  declarations: readonly DeclarationInput[],
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
): ReferenceAnalysisResult {
  const declarationMap = new Map<string, DeclarationInput[]>();

  for (const declaration of declarations) {
    const existing = declarationMap.get(declaration.name);

    if (existing === undefined) {
      declarationMap.set(declaration.name, [declaration]);
      continue;
    }

    existing.push(declaration);
  }

  const references: Reference[] = [];

  visitNode(
    ast,
    scopeBuild.rootScope,
    scopeBuild,
    declarationNodes,
    declarationMap,
    references,
  );

  return {
    references,
  };
}

function visitNode(
  node: TSESTree.Node,
  currentScope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  const scope = findScopeForNode(node, currentScope, scopeBuild);

  switch (node.type) {
    case "ImportDeclaration":
      return;

    case "VariableDeclaration":
      visitVariableDeclaration(
        node,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "FunctionDeclaration":
      visitFunctionDeclaration(
        node,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "FunctionExpression":
    case "ArrowFunctionExpression":
      visitFunctionExpression(
        node,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "ClassDeclaration":
      visitClassDeclaration(
        node,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "ClassExpression":
      visitClassExpression(
        node,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "Identifier":
      visitIdentifier(node, scope, declarationNodes, declarations, references);
      return;

    case "AssignmentExpression":
      visitAssignmentExpression(
        node,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "UpdateExpression":
      visitWriteTarget(
        node.argument,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "MemberExpression":
      visitMemberExpression(
        node,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "Property":
      visitProperty(
        node,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "MethodDefinition":
      visitMethodDefinition(
        node,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "JSXElement":
      visitJSXElement(
        node,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "JSXFragment":
      for (const child of node.children) {
        visitNode(
          child,
          scope,
          scopeBuild,
          declarationNodes,
          declarations,
          references,
        );
      }
      return;

    case "JSXExpressionContainer":
      if (node.expression.type !== "JSXEmptyExpression") {
        visitNode(
          node.expression,
          scope,
          scopeBuild,
          declarationNodes,
          declarations,
          references,
        );
      }
      return;

    case "JSXSpreadChild":
      visitNode(
        node.expression,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    default:
      for (const child of getChildNodes(node)) {
        visitNode(
          child,
          scope,
          scopeBuild,
          declarationNodes,
          declarations,
          references,
        );
      }
  }
}

function visitVariableDeclaration(
  node: TSESTree.VariableDeclaration,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  for (const declaration of node.declarations) {
    if (declaration.init !== null) {
      visitNode(
        declaration.init,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
    }
  }
}

function visitFunctionDeclaration(
  node: TSESTree.FunctionDeclaration,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  const functionScope = scopeBuild.scopeByNode.get(node);

  if (functionScope === undefined) {
    return;
  }

  for (const parameter of node.params) {
    visitPatternDefaults(
      parameter,
      functionScope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }

  visitNode(
    node.body,
    functionScope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );
}

function visitFunctionExpression(
  node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  const functionScope = scopeBuild.scopeByNode.get(node);

  if (functionScope === undefined) {
    return;
  }

  for (const parameter of node.params) {
    visitPatternDefaults(
      parameter,
      functionScope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }

  visitNode(
    node.body,
    functionScope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );
}

function visitPatternDefaults(
  node: TSESTree.Node,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  switch (node.type) {
    case "AssignmentPattern":
      visitNode(
        node.right,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "RestElement":
      visitPatternDefaults(
        node.argument,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "ArrayPattern":
      for (const element of node.elements) {
        if (element !== null) {
          visitPatternDefaults(
            element,
            scope,
            scopeBuild,
            declarationNodes,
            declarations,
            references,
          );
        }
      }
      return;

    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "RestElement") {
          visitPatternDefaults(
            property.argument,
            scope,
            scopeBuild,
            declarationNodes,
            declarations,
            references,
          );
          continue;
        }

        visitPatternDefaults(
          property.value,
          scope,
          scopeBuild,
          declarationNodes,
          declarations,
          references,
        );
      }
      return;

    default:
      return;
  }
}

function visitClassDeclaration(
  node: TSESTree.ClassDeclaration,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  if (node.superClass !== null) {
    visitNode(
      node.superClass,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }

  visitClassBody(
    node.body,
    scope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );
}

function visitClassExpression(
  node: TSESTree.ClassExpression,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  const scope = scopeBuild.scopeByNode.get(node);

  if (scope === undefined) {
    return;
  }

  if (node.superClass !== null) {
    visitNode(
      node.superClass,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }

  visitClassBody(
    node.body,
    scope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );
}

function visitClassBody(
  node: TSESTree.ClassBody,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  for (const element of node.body) {
    visitNode(
      element,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }
}

function visitIdentifier(
  node: TSESTree.Identifier,
  scope: MutableScope,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  if (declarationNodes.has(node) || !isReferenceIdentifier(node)) {
    return;
  }

  addReference(node, scope, false, declarations, references);
}

function visitAssignmentExpression(
  node: TSESTree.AssignmentExpression,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  visitWriteTarget(
    node.left,
    scope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );

  visitNode(
    node.right,
    scope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );
}

function visitWriteTarget(
  node: TSESTree.Node,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  if (node.type === "Identifier") {
    if (!declarationNodes.has(node)) {
      addReference(node, scope, true, declarations, references);
    }

    return;
  }

  if (node.type === "MemberExpression") {
    visitNode(
      node.object,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );

    if (node.computed) {
      visitNode(
        node.property,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
    }

    return;
  }

  if (node.type === "ArrayPattern" || node.type === "ObjectPattern") {
    visitPatternWrite(
      node,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }
}

function visitPatternWrite(
  node: TSESTree.Node,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  switch (node.type) {
    case "Identifier":
      if (!declarationNodes.has(node)) {
        addReference(node, scope, true, declarations, references);
      }
      return;

    case "AssignmentPattern":
      visitWriteTarget(
        node.left,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );

      visitNode(
        node.right,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "RestElement":
      visitPatternWrite(
        node.argument,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      return;

    case "ArrayPattern":
      for (const element of node.elements) {
        if (element !== null) {
          visitPatternWrite(
            element,
            scope,
            scopeBuild,
            declarationNodes,
            declarations,
            references,
          );
        }
      }
      return;

    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "RestElement") {
          visitPatternWrite(
            property.argument,
            scope,
            scopeBuild,
            declarationNodes,
            declarations,
            references,
          );
          continue;
        }

        if (property.computed) {
          visitNode(
            property.key,
            scope,
            scopeBuild,
            declarationNodes,
            declarations,
            references,
          );
        }

        visitPatternWrite(
          property.value,
          scope,
          scopeBuild,
          declarationNodes,
          declarations,
          references,
        );
      }
      return;
  }
}

function visitMemberExpression(
  node: TSESTree.MemberExpression,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  visitNode(
    node.object,
    scope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );

  if (node.computed) {
    visitNode(
      node.property,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }
}

function visitProperty(
  node: TSESTree.Property,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  if (node.computed) {
    visitNode(
      node.key,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }

  visitNode(
    node.value,
    scope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );
}

function visitMethodDefinition(
  node: TSESTree.MethodDefinition,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  if (node.computed) {
    visitNode(
      node.key,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }

  visitNode(
    node.value,
    scope,
    scopeBuild,
    declarationNodes,
    declarations,
    references,
  );
}

function visitJSXElement(
  node: TSESTree.JSXElement,
  scope: MutableScope,
  scopeBuild: ScopeBuildResult,
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
  declarations: ReadonlyMap<string, readonly DeclarationInput[]>,
  references: Reference[],
): void {
  for (const attribute of node.openingElement.attributes) {
    if (attribute.type === "JSXSpreadAttribute") {
      visitNode(
        attribute.argument,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
      continue;
    }

    if (
      attribute.value !== null &&
      attribute.value.type === "JSXExpressionContainer" &&
      attribute.value.expression.type !== "JSXEmptyExpression"
    ) {
      visitNode(
        attribute.value.expression,
        scope,
        scopeBuild,
        declarationNodes,
        declarations,
        references,
      );
    }
  }

  for (const child of node.children) {
    visitNode(
      child,
      scope,
      scopeBuild,
      declarationNodes,
      declarations,
      references,
    );
  }
}

function addReference(
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
