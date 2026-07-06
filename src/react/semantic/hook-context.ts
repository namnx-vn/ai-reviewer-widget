import type { TSESTree } from "@typescript-eslint/typescript-estree";

import {
  analyzeComponents,
  type ComponentAnalysisResult,
} from "./component-analyzer";
import { analyzeHooks, type HookMetadata } from "./hook-analyzer";
import { analyzeScopes } from "./scope/scope-analyzer";
import type { Scope, ScopeAnalysisResult } from "./scope/scope-types";

export type HookExecutionKind =
  | "normal"
  | "conditional"
  | "loop"
  | "nested-function";

export interface FunctionBoundary {
  readonly node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression;
  readonly name?: string;
  readonly scope?: Scope;
  readonly isComponent: boolean;
  readonly isCustomHook: boolean;
}

export interface HookExecutionContext {
  readonly kind: HookExecutionKind;
  readonly isConditional: boolean;
  readonly isLoop: boolean;
  readonly isNestedFunction: boolean;
  readonly conditionalAncestors: readonly TSESTree.Node[];
  readonly loopAncestors: readonly TSESTree.Node[];
  readonly functionBoundary?: FunctionBoundary;
  readonly enclosingScope?: Scope;
}

export interface SemanticHookMetadata {
  readonly hook: HookMetadata;
  readonly execution: HookExecutionContext;
}

export interface HookContext {
  readonly ast: TSESTree.Program;
  readonly hooks: readonly SemanticHookMetadata[];
  readonly components: ComponentAnalysisResult;
  readonly scopes: ScopeAnalysisResult;
  readonly functions: readonly FunctionBoundary[];
}

export function createHookContext(ast: TSESTree.Program): HookContext {
  const hookAnalysis = analyzeHooks(ast);
  const components = analyzeComponents(ast);
  const scopes = analyzeScopes(ast);

  const functions = collectFunctionBoundaries(ast, components, scopes);

  const hooks = hookAnalysis.hooks.map(
    (hook): SemanticHookMetadata => ({
      hook,
      execution: createExecutionContext(hook.node, functions),
    }),
  );

  return {
    ast,
    hooks,
    components,
    scopes,
    functions,
  };
}

function collectFunctionBoundaries(
  ast: TSESTree.Program,
  components: ComponentAnalysisResult,
  scopes: ScopeAnalysisResult,
): FunctionBoundary[] {
  const boundaries: FunctionBoundary[] = [];

  visitNode(ast, (node) => {
    if (!isFunctionNode(node)) {
      return;
    }

    const name = getFunctionName(node);

    boundaries.push({
      node,
      name,
      scope: findEnclosingScope(node, scopes),
      isComponent: isComponentFunction(node, name, components),
      isCustomHook: isCustomHookName(name),
    });
  });

  return boundaries;
}

function createExecutionContext(
  node: TSESTree.Node,
  functions: readonly FunctionBoundary[],
): HookExecutionContext {
  const functionBoundary = findEnclosingFunction(node, functions);

  const ancestors =
    functionBoundary === undefined
      ? []
      : findAncestors(functionBoundary.node, node);

  const conditionalAncestors = ancestors.filter(isConditionalNode);
  const loopAncestors = ancestors.filter(isLoopNode);

  const isConditional =
    conditionalAncestors.length > 0 ||
    hasConditionalExecution(functionBoundary, node);

  const isLoop = loopAncestors.length > 0;

  const isNestedFunction =
    functionBoundary !== undefined &&
    hasContainingFunction(functionBoundary.node, functions);

  let kind: HookExecutionKind = "normal";

  if (isConditional) {
    kind = "conditional";
  } else if (isLoop) {
    kind = "loop";
  } else if (isNestedFunction) {
    kind = "nested-function";
  }

  return {
    kind,
    isConditional,
    isLoop,
    isNestedFunction,
    conditionalAncestors,
    loopAncestors,
    functionBoundary,
    enclosingScope: functionBoundary?.scope,
  };
}

function hasConditionalExecution(
  functionBoundary: FunctionBoundary | undefined,
  hook: TSESTree.Node,
): boolean {
  if (functionBoundary === undefined) {
    return false;
  }

  if (functionBoundary.node.body.type !== "BlockStatement") {
    return false;
  }

  return hasEarlyReturnBefore(functionBoundary.node.body.body, hook);
}

function hasEarlyReturnBefore(
  statements: readonly TSESTree.Statement[],
  hook: TSESTree.Node,
): boolean {
  for (const statement of statements) {
    if (containsNode(statement, hook)) {
      return false;
    }

    if (statement.type === "ReturnStatement") {
      return true;
    }

    if (statement.type === "IfStatement") {
      if (
        statement.alternate !== null &&
        containsNode(statement.alternate, hook)
      ) {
        return hasEarlyReturnBefore(
          statement.alternate.type === "BlockStatement"
            ? statement.alternate.body
            : [statement.alternate],
          hook,
        );
      }

      if (containsNode(statement.consequent, hook)) {
        return hasEarlyReturnBefore(
          statement.consequent.type === "BlockStatement"
            ? statement.consequent.body
            : [statement.consequent],
          hook,
        );
      }
    }
  }

  return false;
}

function findEnclosingFunction(
  node: TSESTree.Node,
  functions: readonly FunctionBoundary[],
): FunctionBoundary | undefined {
  let bestMatch: FunctionBoundary | undefined;

  for (const boundary of functions) {
    if (!containsNode(boundary.node, node)) {
      continue;
    }

    if (
      bestMatch === undefined ||
      getNodeRangeSize(boundary.node) < getNodeRangeSize(bestMatch.node)
    ) {
      bestMatch = boundary;
    }
  }

  return bestMatch;
}

function findAncestors(
  root: TSESTree.Node,
  target: TSESTree.Node,
): TSESTree.Node[] {
  const ancestors: TSESTree.Node[] = [];

  findAncestorPath(root, target, ancestors);

  return ancestors;
}

function findAncestorPath(
  node: TSESTree.Node,
  target: TSESTree.Node,
  ancestors: TSESTree.Node[],
): boolean {
  if (node === target) {
    return true;
  }

  for (const child of getChildNodes(node)) {
    if (!containsNode(child, target)) {
      continue;
    }

    if (findAncestorPath(child, target, ancestors)) {
      if (child !== target) {
        ancestors.unshift(child);
      }

      return true;
    }
  }

  return false;
}

function hasContainingFunction(
  boundary: TSESTree.Node,
  functions: readonly FunctionBoundary[],
): boolean {
  return functions.some(
    (candidate) =>
      candidate.node !== boundary && containsNode(candidate.node, boundary),
  );
}

function findEnclosingScope(
  node: TSESTree.Node,
  scopes: ScopeAnalysisResult,
): Scope | undefined {
  let bestMatch: Scope | undefined;

  for (const scope of scopes.scopes) {
    if (!containsNode(scope.node, node)) {
      continue;
    }

    if (
      bestMatch === undefined ||
      getNodeRangeSize(scope.node) < getNodeRangeSize(bestMatch.node)
    ) {
      bestMatch = scope;
    }
  }

  return bestMatch;
}

function isConditionalNode(node: TSESTree.Node): boolean {
  return (
    node.type === "IfStatement" ||
    node.type === "ConditionalExpression" ||
    node.type === "LogicalExpression" ||
    node.type === "SwitchStatement" ||
    node.type === "SwitchCase"
  );
}

function isLoopNode(node: TSESTree.Node): boolean {
  return (
    node.type === "ForStatement" ||
    node.type === "ForInStatement" ||
    node.type === "ForOfStatement" ||
    node.type === "WhileStatement" ||
    node.type === "DoWhileStatement"
  );
}

function isComponentFunction(
  node: TSESTree.Node,
  name: string | undefined,
  components: ComponentAnalysisResult,
): boolean {
  return components.components.some(
    (component) =>
      component.node === node ||
      (name !== undefined && component.name === name),
  );
}

function isCustomHookName(name: string | undefined): boolean {
  return name !== undefined && /^use[A-Z0-9]/u.test(name);
}

function containsNode(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  const parentStart = parent.range?.[0];
  const parentEnd = parent.range?.[1];
  const childStart = child.range?.[0];
  const childEnd = child.range?.[1];

  if (
    parentStart === undefined ||
    parentEnd === undefined ||
    childStart === undefined ||
    childEnd === undefined
  ) {
    return false;
  }

  return parentStart <= childStart && childEnd <= parentEnd;
}

function getNodeRangeSize(node: TSESTree.Node): number {
  const start = node.range?.[0];
  const end = node.range?.[1];

  if (start === undefined || end === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }

  return end - start;
}

function isFunctionNode(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function getFunctionName(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string | undefined {
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  ) {
    return node.id?.name;
  }

  return undefined;
}

function visitNode(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visitNode(value, callback);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        visitNode(item, callback);
      }
    }
  }
}

function getChildNodes(node: TSESTree.Node): readonly TSESTree.Node[] {
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

function isNode(value: unknown): value is TSESTree.Node {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  return typeof value.type === "string";
}
