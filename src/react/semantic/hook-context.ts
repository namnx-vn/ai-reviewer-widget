
import type { TSESTree } from "@typescript-eslint/typescript-estree";

import {
  analyzeComponents,
  type ComponentAnalysisResult,
} from "./component-analyzer";
import {
  analyzeHooks,
  type HookAnalysisResult,
} from "./hook-analyzer";
import {
  analyzeScopes,
  type ScopeAnalysisResult,
} from "./scope/scope-analyzer";
import type {
  Scope,
  ScopeKind,
} from "./scope/scope-types";

export interface ReactFunctionBoundary {
  readonly node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression;
  readonly name?: string;
  readonly scope?: Scope;
  readonly isComponent: boolean;
  readonly isCustomHook: boolean;
}

export interface ReactHookExecutionContext {
  readonly hook: ReturnType<typeof analyzeHooks>["hooks"][number];
  readonly functionBoundary?: ReactFunctionBoundary;
  readonly enclosingScope?: Scope;
}

export interface ReactHookContext {
  readonly ast: TSESTree.Program;
  readonly hooks: HookAnalysisResult;
  readonly components: ComponentAnalysisResult;
  readonly scopes: ScopeAnalysisResult;
  readonly functions: readonly ReactFunctionBoundary[];
  readonly executions: readonly ReactHookExecutionContext[];
}

export function createReactHookContext(
  ast: TSESTree.Program,
): ReactHookContext {
  const hooks = analyzeHooks(ast);
  const components = analyzeComponents(ast);
  const scopes = analyzeScopes(ast);
  const functions = collectFunctionBoundaries(
    ast,
    components,
    scopes,
  );

  const executions = hooks.hooks.map(
    (hook): ReactHookExecutionContext => {
      const functionBoundary = findEnclosingFunction(
        hook.node,
        functions,
      );

      return {
        hook,
        functionBoundary,
        enclosingScope:
          functionBoundary === undefined
            ? undefined
            : findEnclosingScope(
                functionBoundary.node,
                scopes,
              ),
      };
    },
  );

  return {
    ast,
    hooks,
    components,
    scopes,
    functions,
    executions,
  };
}

function collectFunctionBoundaries(
  ast: TSESTree.Program,
  components: ComponentAnalysisResult,
  scopes: ScopeAnalysisResult,
): ReactFunctionBoundary[] {
  const boundaries: ReactFunctionBoundary[] = [];

  visitNode(ast, (node) => {
    if (!isFunctionNode(node)) {
      return;
    }

    const name = getFunctionName(node);

    boundaries.push({
      node,
      name,
      scope: findEnclosingScope(node, scopes),
      isComponent: isComponentFunction(
        node,
        name,
        components,
      ),
      isCustomHook: isCustomHookName(name),
    });
  });

  return boundaries;
}

function findEnclosingFunction(
  node: TSESTree.Node,
  functions: readonly ReactFunctionBoundary[],
): ReactFunctionBoundary | undefined {
  let bestMatch: ReactFunctionBoundary | undefined;

  for (const boundary of functions) {
    if (!containsNode(boundary.node, node)) {
      continue;
    }

    if (
      bestMatch === undefined ||
      getNodeRangeSize(boundary.node) <
        getNodeRangeSize(bestMatch.node)
    ) {
      bestMatch = boundary;
    }
  }

  return bestMatch;
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
      getNodeRangeSize(scope.node) <
        getNodeRangeSize(bestMatch.node)
    ) {
      bestMatch = scope;
    }
  }

  return bestMatch;
}

function isComponentFunction(
  node: TSESTree.Node,
  name: string | undefined,
  components: ComponentAnalysisResult,
): boolean {
  return components.components.some(
    (component) =>
      component.node === node ||
      (
        name !== undefined &&
        component.name === name
      ),
  );
}

function isCustomHookName(
  name: string | undefined,
): boolean {
  return (
    name !== undefined &&
    /^use[A-Z0-9]/u.test(name)
  );
}

function containsNode(
  parent: TSESTree.Node,
  child: TSESTree.Node,
): boolean {
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

  return (
    parentStart <= childStart &&
    childEnd <= parentEnd
  );
}

function getNodeRangeSize(
  node: TSESTree.Node,
): number {
  const start = node.range?.[0];
  const end = node.range?.[1];

  if (
    start === undefined ||
    end === undefined
  ) {
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

function isNode(
  value: unknown,
): value is TSESTree.Node {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value)
  ) {
    return false;
  }

  return typeof value.type === "string";
}

