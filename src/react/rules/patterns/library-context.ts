import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { visit } from "../../ast/component-utils";
import { getJSXName } from "../../ast/jsx-utils";
import type { ReactRuleContext } from "../../engine/react-rule";

const REACT_QUERY_PACKAGES = new Set([
  "@tanstack/react-query",
  "react-query",
]);

interface ImportBindings {
  readonly reactQueryApis: ReadonlyMap<string, string>;
  readonly reactQueryNamespaces: ReadonlySet<string>;
  readonly reactApis: ReadonlyMap<string, string>;
  readonly reactNamespaces: ReadonlySet<string>;
}

const importCache = new WeakMap<TSESTree.Program, ImportBindings>();
const lazyComponentCache = new WeakMap<TSESTree.Program, ReadonlySet<string>>();

export function getReactQueryApiName(
  node: TSESTree.CallExpression,
  context: ReactRuleContext,
): string | undefined {
  const bindings = getImportBindings(context.ast);

  return getImportedCallName(
    node,
    bindings.reactQueryApis,
    bindings.reactQueryNamespaces,
  );
}

export function getReactApiName(
  node: TSESTree.CallExpression,
  context: ReactRuleContext,
): string | undefined {
  const bindings = getImportBindings(context.ast);

  return getImportedCallName(
    node,
    bindings.reactApis,
    bindings.reactNamespaces,
  );
}

export function isSuspenseElement(
  node: TSESTree.JSXElement,
  context: ReactRuleContext,
): boolean {
  const bindings = getImportBindings(context.ast);
  const name = getJSXName(node.openingElement.name);

  if (name === undefined) {
    return false;
  }

  if (bindings.reactApis.get(name) === "Suspense") {
    return true;
  }

  const separator = name.indexOf(".");

  if (separator < 1) {
    return false;
  }

  const namespace = name.slice(0, separator);
  const property = name.slice(separator + 1);

  return (
    property === "Suspense" &&
    bindings.reactNamespaces.has(namespace)
  );
}

export function collectLazyComponentNames(
  context: ReactRuleContext,
): ReadonlySet<string> {
  const cached = lazyComponentCache.get(context.ast);

  if (cached !== undefined) {
    return cached;
  }

  const names = new Set<string>();

  visit(context.ast, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      node.id.type !== "Identifier" ||
      node.init?.type !== "CallExpression" ||
      getReactApiName(node.init, context) !== "lazy"
    ) {
      return;
    }

    names.add(node.id.name);
  });

  lazyComponentCache.set(context.ast, names);

  return names;
}

export function isReactComponentClass(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  context: ReactRuleContext,
): boolean {
  const superClass = node.superClass;

  if (superClass === null) {
    return false;
  }

  const bindings = getImportBindings(context.ast);

  if (superClass.type === "Identifier") {
    const imported = bindings.reactApis.get(superClass.name);

    return imported === "Component" || imported === "PureComponent";
  }

  if (
    superClass.type !== "MemberExpression" ||
    superClass.computed ||
    superClass.object.type !== "Identifier" ||
    !bindings.reactNamespaces.has(superClass.object.name) ||
    superClass.property.type !== "Identifier"
  ) {
    return false;
  }

  return (
    superClass.property.name === "Component" ||
    superClass.property.name === "PureComponent"
  );
}

function getImportBindings(ast: TSESTree.Program): ImportBindings {
  const cached = importCache.get(ast);

  if (cached !== undefined) {
    return cached;
  }

  const reactQueryApis = new Map<string, string>();
  const reactQueryNamespaces = new Set<string>();
  const reactApis = new Map<string, string>();
  const reactNamespaces = new Set<string>();

  for (const statement of ast.body) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }

    const source = String(statement.source.value);

    if (REACT_QUERY_PACKAGES.has(source)) {
      collectSpecifiers(
        statement,
        reactQueryApis,
        reactQueryNamespaces,
        false,
      );
    } else if (source === "react") {
      collectSpecifiers(
        statement,
        reactApis,
        reactNamespaces,
        true,
      );
    }
  }

  const result: ImportBindings = {
    reactQueryApis,
    reactQueryNamespaces,
    reactApis,
    reactNamespaces,
  };

  importCache.set(ast, result);

  return result;
}

function collectSpecifiers(
  declaration: TSESTree.ImportDeclaration,
  apis: Map<string, string>,
  namespaces: Set<string>,
  defaultActsAsNamespace: boolean,
): void {
  for (const specifier of declaration.specifiers) {
    if (specifier.type === "ImportSpecifier") {
      const imported =
        specifier.imported.type === "Identifier"
          ? specifier.imported.name
          : String(specifier.imported.value);

      apis.set(specifier.local.name, imported);
      continue;
    }

    if (specifier.type === "ImportNamespaceSpecifier") {
      namespaces.add(specifier.local.name);
      continue;
    }

    if (
      defaultActsAsNamespace &&
      specifier.type === "ImportDefaultSpecifier"
    ) {
      namespaces.add(specifier.local.name);
    }
  }
}

function getImportedCallName(
  node: TSESTree.CallExpression,
  apis: ReadonlyMap<string, string>,
  namespaces: ReadonlySet<string>,
): string | undefined {
  if (node.callee.type === "Identifier") {
    return apis.get(node.callee.name);
  }

  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.object.type !== "Identifier" ||
    !namespaces.has(node.callee.object.name) ||
    node.callee.property.type !== "Identifier"
  ) {
    return undefined;
  }

  return node.callee.property.name;
}
