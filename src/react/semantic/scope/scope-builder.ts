import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  createScope,
  getChildNodes,
  isFunctionNode,
  type MutableScope,
  type ScopeBuildState,
} from "./scope-utils";

export interface ScopeBuildResult {
  readonly rootScope: MutableScope;
  readonly scopes: readonly MutableScope[];
  readonly scopeByNode: ReadonlyMap<
    TSESTree.Node,
    MutableScope
  >;
}

export function buildScopes(
  ast: TSESTree.Program,
): ScopeBuildResult {
  const state: ScopeBuildState = {
    scopes: [],
    scopeByNode: new Map(),
    nextScopeId: 0,
  };

  const rootScope = createScope(
    state,
    "program",
    ast,
  );

  visitNode(
    ast,
    rootScope,
    state,
  );

  return {
    rootScope,
    scopes: state.scopes,
    scopeByNode:
      state.scopeByNode,
  };
}

function visitNode(
  node: TSESTree.Node,
  currentScope: MutableScope,
  state: ScopeBuildState,
): void {
  if (
    node !== currentScope.node &&
    isFunctionNode(node)
  ) {
    const functionScope =
      createScope(
        state,
        "function",
        node,
        currentScope,
      );

    visitFunction(
      node,
      functionScope,
      state,
    );

    return;
  }

  if (
    node.type ===
      "BlockStatement" &&
    node !== currentScope.node
  ) {
    const blockScope =
      createScope(
        state,
        "block",
        node,
        currentScope,
      );

    for (const statement of node.body) {
      visitNode(
        statement,
        blockScope,
        state,
      );
    }

    return;
  }

  if (
    node.type === "CatchClause" &&
    node !== currentScope.node
  ) {
    const catchScope =
      createScope(
        state,
        "catch",
        node,
        currentScope,
      );

    if (node.param !== null) {
      visitNode(
        node.param,
        catchScope,
        state,
      );
    }

    visitNode(
      node.body,
      catchScope,
      state,
    );

    return;
  }

  for (const child of getChildNodes(node)) {
    visitNode(
      child,
      currentScope,
      state,
    );
  }
}

function visitFunction(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
  functionScope: MutableScope,
  state: ScopeBuildState,
): void {
  for (const parameter of node.params) {
    visitNode(
      parameter,
      functionScope,
      state,
    );
  }

  visitNode(
    node.body,
    functionScope,
    state,
  );
}