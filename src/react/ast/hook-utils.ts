import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type ReactHookKind = "builtin" | "custom";

const BUILTIN_REACT_HOOKS = new Set<string>([
  "useCallback",
  "useContext",
  "useDebugValue",
  "useDeferredValue",
  "useEffect",
  "useId",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
]);

export function isHookName(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

export function isBuiltinReactHook(name: string): boolean {
  return BUILTIN_REACT_HOOKS.has(name);
}

export function getHookKind(name: string): ReactHookKind | undefined {
  if (isBuiltinReactHook(name)) {
    return "builtin";
  }

  if (isHookName(name)) {
    return "custom";
  }

  return undefined;
}

export function getMemberExpressionName(
  node: TSESTree.MemberExpression,
): string | undefined {
  if (node.computed) {
    return undefined;
  }

  if (node.property.type !== "Identifier") {
    return undefined;
  }

  return node.property.name;
}

export function getHookCalleeName(
  node: TSESTree.CallExpression,
): string | undefined {
  if (node.callee.type === "Identifier") {
    return node.callee.name;
  }

  if (node.callee.type === "MemberExpression") {
    return getMemberExpressionName(node.callee);
  }

  return undefined;
}

export function isHookCall(
  node: TSESTree.Node,
): node is TSESTree.CallExpression {
  if (node.type !== "CallExpression") {
    return false;
  }

  const name = getHookCalleeName(node);

  return name !== undefined && isHookName(name);
}

export function isReactMemberHook(
  node: TSESTree.CallExpression,
  reactNamespaceNames: ReadonlySet<string>,
): boolean {
  if (node.callee.type !== "MemberExpression") {
    return false;
  }

  if (node.callee.computed) {
    return false;
  }

  if (node.callee.object.type !== "Identifier") {
    return false;
  }

  if (node.callee.property.type !== "Identifier") {
    return false;
  }

  if (!reactNamespaceNames.has(node.callee.object.name)) {
    return false;
  }

  return isHookName(node.callee.property.name);
}

export function getImportedHookName(
  node: TSESTree.ImportSpecifier,
): string | undefined {
  if (node.imported.type === "Identifier") {
    return node.imported.name;
  }

  return undefined;
}