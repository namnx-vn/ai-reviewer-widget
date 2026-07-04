import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  getHookCalleeName,
  getImportedHookName,
  getHookKind,
  isReactMemberHook,
  type ReactHookKind,
} from "../ast/hook-utils";

export interface HookLocation {
  readonly line: number;
  readonly column: number;
}

export interface HookMetadata {
  readonly name: string;
  readonly kind: ReactHookKind;
  readonly node: TSESTree.CallExpression;
  readonly location: HookLocation;
  readonly isReactImport: boolean;
  readonly enclosingFunctionName?: string;
}

export interface HookAnalysisResult {
  readonly hooks: readonly HookMetadata[];
}

interface HookAliases {
  readonly importedHooks: ReadonlyMap<string, string>;
  readonly reactNamespaces: ReadonlySet<string>;
}

interface FunctionScope {
  readonly name?: string;
}

export function analyzeHooks(
  ast: TSESTree.Program,
): HookAnalysisResult {
  const aliases = collectReactAliases(ast);
  const hooks: HookMetadata[] = [];

  traverseProgram(
    ast,
    aliases,
    hooks,
    [],
  );

  return {
    hooks,
  };
}

function collectReactAliases(
  ast: TSESTree.Program,
): HookAliases {
  const importedHooks = new Map<string, string>();
  const reactNamespaces = new Set<string>();

  for (const statement of ast.body) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }

    if (
      getLiteralStringValue(
        statement.source,
      ) !== "react"
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        specifier.type ===
        "ImportNamespaceSpecifier"
      ) {
        reactNamespaces.add(
          specifier.local.name,
        );

        continue;
      }

      if (
        specifier.type !==
        "ImportSpecifier"
      ) {
        continue;
      }

      const importedName =
        getImportedHookName(specifier);

      if (
        importedName === undefined ||
        getHookKind(importedName) === undefined
      ) {
        continue;
      }

      importedHooks.set(
        specifier.local.name,
        importedName,
      );
    }
  }

  return {
    importedHooks,
    reactNamespaces,
  };
}

function traverseProgram(
  node: TSESTree.Node,
  aliases: HookAliases,
  hooks: HookMetadata[],
  functionStack: readonly FunctionScope[],
): void {
  if (node.type === "CallExpression") {
    const metadata = createHookMetadata(
      node,
      aliases,
      functionStack,
    );

    if (metadata !== undefined) {
      hooks.push(metadata);
    }
  }

  if (isFunctionNode(node)) {
    const functionScope: FunctionScope = {
      name: getFunctionName(node),
    };

    for (const child of getFunctionChildren(node)) {
      traverseProgram(
        child,
        aliases,
        hooks,
        [...functionStack, functionScope],
      );
    }

    return;
  }

  for (const child of getChildNodes(node)) {
    traverseProgram(
      child,
      aliases,
      hooks,
      functionStack,
    );
  }
}

function createHookMetadata(
  node: TSESTree.CallExpression,
  aliases: HookAliases,
  functionStack: readonly FunctionScope[],
): HookMetadata | undefined {
  const directName = getHookCalleeName(node);

  if (directName === undefined) {
    return undefined;
  }

  const importedName =
    aliases.importedHooks.get(directName);

  if (importedName !== undefined) {
    const kind = getHookKind(importedName);

    if (kind === undefined) {
      return undefined;
    }

    return {
      name: importedName,
      kind,
      node,
      location: getLocation(node),
      isReactImport: true,
      enclosingFunctionName:
        getNearestFunctionName(
          functionStack,
        ),
    };
  }

  if (
    isReactMemberHook(
      node,
      aliases.reactNamespaces,
    )
  ) {
    const kind = getHookKind(directName);

    if (kind === undefined) {
      return undefined;
    }

    return {
      name: directName,
      kind,
      node,
      location: getLocation(node),
      isReactImport: true,
      enclosingFunctionName:
        getNearestFunctionName(
          functionStack,
        ),
    };
  }

  if (node.callee.type === "Identifier") {
    const kind = getHookKind(directName);

    if (kind === undefined) {
      return undefined;
    }

    return {
      name: directName,
      kind,
      node,
      location: getLocation(node),
      isReactImport: false,
      enclosingFunctionName:
        getNearestFunctionName(
          functionStack,
        ),
    };
  }

  return undefined;
}

function getNearestFunctionName(
  stack: readonly FunctionScope[],
): string | undefined {
  for (
    let index = stack.length - 1;
    index >= 0;
    index -= 1
  ) {
    const name = stack[index]?.name;

    if (name !== undefined) {
      return name;
    }
  }

  return undefined;
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

function getFunctionChildren(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): readonly TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  if (node.type === "ArrowFunctionExpression") {
    for (const parameter of node.params) {
      children.push(parameter);
    }

    if (node.body.type === "BlockStatement") {
      children.push(node.body);
    } else {
      children.push(node.body);
    }

    return children;
  }

  for (const parameter of node.params) {
    children.push(parameter);
  }

  children.push(node.body);

  return children;
}

function getChildNodes(
  node: TSESTree.Node,
): readonly TSESTree.Node[] {
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

function getLiteralStringValue(
  node: TSESTree.StringLiteral,
): string {
  return node.value;
}

function getLocation(
  node: TSESTree.Node,
): HookLocation {
  return {
    line: node.loc?.start.line ?? 1,
    column: node.loc?.start.column ?? 0,
  };
}