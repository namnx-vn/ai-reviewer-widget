import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { FrameworkContext } from "../../semantic/framework-context";

export interface ReactImports {
  readonly named: ReadonlyMap<string, string>;
  readonly namespaces: ReadonlySet<string>;
}

export function supportsReact19(
  framework: FrameworkContext | undefined,
  minimumMinor = 0,
): boolean {
  const version = framework?.react.minimumVersion;

  return (
    framework?.react.detected === true &&
    version !== undefined &&
    (version.major > 19 ||
      (version.major === 19 && version.minor >= minimumMinor))
  );
}

export function collectReactImports(ast: TSESTree.Program): ReactImports {
  const named = new Map<string, string>();
  const namespaces = new Set<string>();

  for (const statement of ast.body) {
    if (
      statement.type !== "ImportDeclaration" ||
      statement.source.value !== "react"
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        const imported =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value;

        named.set(specifier.local.name, imported);
        continue;
      }

      namespaces.add(specifier.local.name);
    }
  }

  return { named, namespaces };
}

export function isReactApiCall(
  node: TSESTree.CallExpression,
  api: string,
  imports: ReactImports,
): boolean {
  if (node.callee.type === "Identifier") {
    return imports.named.get(node.callee.name) === api;
  }

  return (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    imports.namespaces.has(node.callee.object.name) &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === api
  );
}

export function getChildNodes(node: TSESTree.Node): readonly TSESTree.Node[] {
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

export function visit(
  node: TSESTree.Node,
  callback: (child: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

export function isFunctionNode(
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

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}
