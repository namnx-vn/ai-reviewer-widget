/**
 * Describes a hook whose arguments follow React's callback/dependency-array
 * convention. Custom hooks are opt-in so ordinary hooks never produce
 * dependency findings by accident.
 */
export interface DependencyHookConfiguration {
  readonly name: string;
  readonly callbackIndex?: number;
  readonly dependencyArrayIndex?: number;
}

export interface ResolvedDependencyHookConfiguration {
  readonly name: string;
  readonly callbackIndex: number;
  readonly dependencyArrayIndex: number;
}

export interface DependencyHookCallAnalysis {
  readonly callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression;
  readonly dependencyArray: TSESTree.ArrayExpression;
}

export const REACT_DEPENDENCY_HOOKS: readonly ResolvedDependencyHookConfiguration[] = [
  { name: "useEffect", callbackIndex: 0, dependencyArrayIndex: 1 },
  { name: "useMemo", callbackIndex: 0, dependencyArrayIndex: 1 },
  { name: "useCallback", callbackIndex: 0, dependencyArrayIndex: 1 },
];

export function getDependencyHookConfiguration(
  name: string,
  customHooks: readonly DependencyHookConfiguration[] = [],
): ResolvedDependencyHookConfiguration | undefined {
  const configured = [...REACT_DEPENDENCY_HOOKS, ...customHooks].find(
    (hook) => hook.name === name,
  );

  if (configured === undefined) {
    return undefined;
  }

  return {
    name: configured.name,
    callbackIndex: configured.callbackIndex ?? 0,
    dependencyArrayIndex: configured.dependencyArrayIndex ?? 1,
  };
}

/**
 * Reads only the configured arguments, allowing custom hooks to use a
 * different argument order without duplicating AST narrowing in each rule.
 */
export function analyzeDependencyHookCall(
  node: TSESTree.CallExpression,
  configuration: ResolvedDependencyHookConfiguration,
): DependencyHookCallAnalysis | undefined {
  const callback = node.arguments[configuration.callbackIndex];
  const dependencyArray = node.arguments[configuration.dependencyArrayIndex];

  if (
    (callback?.type !== "ArrowFunctionExpression" &&
      callback?.type !== "FunctionExpression") ||
    dependencyArray?.type !== "ArrayExpression"
  ) {
    return undefined;
  }

  return { callback, dependencyArray };
}
import type { TSESTree } from "@typescript-eslint/typescript-estree";
