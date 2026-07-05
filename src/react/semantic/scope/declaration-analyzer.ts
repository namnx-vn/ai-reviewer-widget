import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  DeclarationInput,
  findInnermostScope,
  findNearestFunctionScope,
  getLocation,
  visit,
  type MutableScope,
} from "./scope-utils";
import type { BindingKind, Declaration } from "./scope-types";

export interface DeclarationAnalysisResult {
  readonly declarations: readonly Declaration[];
  readonly declarationNodes: ReadonlySet<TSESTree.Identifier>;
}

export function analyzeDeclarations(
  ast: TSESTree.Program,
  rootScope: MutableScope,
): DeclarationAnalysisResult {
  const declarations: Declaration[] = [];
  const declarationNodes = new Set<TSESTree.Identifier>();

  visit(ast, (node) => {
    switch (node.type) {
      case "VariableDeclaration":
        analyzeVariableDeclaration(
          node,
          rootScope,
          declarations,
          declarationNodes,
        );
        break;

      case "FunctionDeclaration":
        analyzeFunctionDeclaration(
          node,
          rootScope,
          declarations,
          declarationNodes,
        );
        break;

      case "ClassDeclaration":
        analyzeClassDeclaration(
          node,
          rootScope,
          declarations,
          declarationNodes,
        );
        break;

      case "ImportDeclaration":
        analyzeImportDeclaration(
          node,
          rootScope,
          declarations,
          declarationNodes,
        );
        break;

      case "FunctionExpression":
      case "ArrowFunctionExpression":
        analyzeFunctionParameters(
          node,
          rootScope,
          declarations,
          declarationNodes,
        );
        break;

      case "CatchClause":
        analyzeCatchClause(node, rootScope, declarations, declarationNodes);
        break;

      default:
        break;
    }
  });

  return {
    declarations,
    declarationNodes,
  };
}

function analyzeVariableDeclaration(
  node: TSESTree.VariableDeclaration,
  rootScope: MutableScope,
  declarations: Declaration[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  const kind: BindingKind =
    node.kind === "var" ? "var" : node.kind === "let" ? "let" : "const";

  for (const declarator of node.declarations) {
    const scope = findInnermostScope(rootScope, declarator);

    const targetScope =
      kind === "var" ? findNearestFunctionScope(scope) : scope;

    collectPatternDeclarations(
      declarator.id,
      kind,
      targetScope,
      declarations,
      declarationNodes,
    );
  }
}

function analyzeFunctionDeclaration(
  node: TSESTree.FunctionDeclaration,
  rootScope: MutableScope,
  declarations: Declaration[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  if (node.id === null) {
    return;
  }

  const scope = findInnermostScope(rootScope, node);

  addDeclaration(
    node.id,
    "function",
    node,
    scope,
    declarations,
    declarationNodes,
  );

  analyzeFunctionParameters(node, rootScope, declarations, declarationNodes);
}

function analyzeClassDeclaration(
  node: TSESTree.ClassDeclaration,
  rootScope: MutableScope,
  declarations: Declaration[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  if (node.id === null) {
    return;
  }

  const scope = findInnermostScope(rootScope, node);

  addDeclaration(node.id, "class", node, scope, declarations, declarationNodes);
}

function analyzeImportDeclaration(
  node: TSESTree.ImportDeclaration,
  rootScope: MutableScope,
  declarations: Declaration[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  const scope = findInnermostScope(rootScope, node);

  for (const specifier of node.specifiers) {
    addDeclaration(
      specifier.local,
      "import",
      specifier,
      scope,
      declarations,
      declarationNodes,
    );
  }
}

function analyzeFunctionParameters(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  rootScope: MutableScope,
  declarations: Declaration[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  const functionScope = findInnermostScope(rootScope, node);

  for (const parameter of node.params) {
    collectPatternDeclarations(
      parameter,
      "parameter",
      functionScope,
      declarations,
      declarationNodes,
    );
  }
}

function analyzeCatchClause(
  node: TSESTree.CatchClause,
  rootScope: MutableScope,
  declarations: Declaration[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  if (node.param === null) {
    return;
  }

  const scope = findInnermostScope(rootScope, node);

  collectPatternDeclarations(
    node.param,
    "catch",
    scope,
    declarations,
    declarationNodes,
  );
}

function collectPatternDeclarations(
  node:
    | TSESTree.BindingName
    | TSESTree.AssignmentPattern
    | TSESTree.RestElement
    | TSESTree.ArrayPattern
    | TSESTree.ObjectPattern,
  kind: BindingKind,
  scope: MutableScope,
  declarations: Declaration[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  switch (node.type) {
    case "Identifier":
      addDeclaration(node, kind, node, scope, declarations, declarationNodes);
      return;

    case "AssignmentPattern":
      collectPatternDeclarations(
        node.left,
        kind,
        scope,
        declarations,
        declarationNodes,
      );
      return;

    case "RestElement":
      collectPatternDeclarations(
        node.argument,
        kind,
        scope,
        declarations,
        declarationNodes,
      );
      return;

    case "ArrayPattern":
      for (const element of node.elements) {
        if (element !== null) {
          collectPatternDeclarations(
            element,
            kind,
            scope,
            declarations,
            declarationNodes,
          );
        }
      }
      return;

    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "RestElement") {
          collectPatternDeclarations(
            property.argument,
            kind,
            scope,
            declarations,
            declarationNodes,
          );
          continue;
        }

        collectPatternDeclarations(
          property.value,
          kind,
          scope,
          declarations,
          declarationNodes,
        );
      }

      return;
  }
}

function addDeclaration(
  node: TSESTree.Identifier,
  kind: DeclarationInput["kind"],
  scope: MutableScope,
  declarations: DeclarationInput[],
  declarationNodes: Set<TSESTree.Identifier>,
): void {
  const declaration: DeclarationInput = {
    name: node.name,
    kind,
    node,
    location: getLocation(node),
    scopeId: scope.id,
  };

  declarations.push(declaration);

  declarationNodes.add(node);

  scope.declarations.push(declaration);
}
