import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReactRuleContext } from "../../engine/react-rule";

export type RscModuleKind = "client" | "server" | "shared" | "conflict";

export interface RscModuleAnalysis {
  readonly kind: RscModuleKind;
  readonly clientDirective?: TSESTree.ExpressionStatement;
  readonly serverDirective?: TSESTree.ExpressionStatement;
  readonly clientOnlyImports: readonly TSESTree.ImportDeclaration[];
  readonly serverOnlyImports: readonly TSESTree.ImportDeclaration[];
  readonly reactNamedImports: ReadonlyMap<string, string>;
  readonly reactNamespaces: ReadonlySet<string>;
  readonly boundNames: ReadonlySet<string>;
}

const analysisCache = new WeakMap<TSESTree.Program, RscModuleAnalysis>();

export function analyzeRscModule(
  context: ReactRuleContext,
): RscModuleAnalysis {
  const cached = analysisCache.get(context.ast);

  if (cached !== undefined) {
    return cached;
  }

  let clientDirective: TSESTree.ExpressionStatement | undefined;
  let serverDirective: TSESTree.ExpressionStatement | undefined;

  for (const statement of context.ast.body) {
    const directive = getDirective(statement);

    if (directive === undefined) {
      break;
    }

    if (directive === "use client") {
      clientDirective = statement;
    }

    if (directive === "use server") {
      serverDirective = statement;
    }
  }

  const clientOnlyImports: TSESTree.ImportDeclaration[] = [];
  const serverOnlyImports: TSESTree.ImportDeclaration[] = [];
  const reactNamedImports = new Map<string, string>();
  const reactNamespaces = new Set<string>();
  const boundNames = new Set<string>();

  visit(context.ast, (node) => {
    collectBoundNames(node, boundNames);

    if (node.type !== "ImportDeclaration") {
      return;
    }

    const source = getImportSource(node);

    if (source === "client-only") {
      clientOnlyImports.push(node);
    }

    if (source === "server-only") {
      serverOnlyImports.push(node);
    }

    if (source !== "react") {
      return;
    }

    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        const importedName = getImportedName(specifier.imported);

        if (importedName !== undefined) {
          reactNamedImports.set(specifier.local.name, importedName);
        }
        continue;
      }

      reactNamespaces.add(specifier.local.name);
    }
  });

  const clientEvidence =
    clientDirective !== undefined || clientOnlyImports.length > 0;
  const serverEvidence =
    serverDirective !== undefined || serverOnlyImports.length > 0;

  const kind: RscModuleKind =
    clientEvidence && serverEvidence
      ? "conflict"
      : clientEvidence
        ? "client"
        : serverEvidence
          ? "server"
          : "shared";

  const result: RscModuleAnalysis = {
    kind,
    clientDirective,
    serverDirective,
    clientOnlyImports,
    serverOnlyImports,
    reactNamedImports,
    reactNamespaces,
    boundNames,
  };

  analysisCache.set(context.ast, result);
  return result;
}

export function isExplicitServerModule(context: ReactRuleContext): boolean {
  return analyzeRscModule(context).kind === "server";
}

export function isExplicitClientModule(context: ReactRuleContext): boolean {
  return analyzeRscModule(context).kind === "client";
}

export function getReactCallName(
  node: TSESTree.CallExpression,
  analysis: RscModuleAnalysis,
): string | undefined {
  if (node.callee.type === "Identifier") {
    return analysis.reactNamedImports.get(node.callee.name);
  }

  if (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    node.callee.property.type === "Identifier" &&
    analysis.reactNamespaces.has(node.callee.object.name)
  ) {
    return node.callee.property.name;
  }

  return undefined;
}

export function getImportSource(
  node: TSESTree.ImportDeclaration,
): string | undefined {
  return typeof node.source.value === "string"
    ? node.source.value
    : undefined;
}

export function getFunctionUseServerDirective(
  node: TSESTree.Node,
): TSESTree.ExpressionStatement | undefined {
  if (!isFunctionNode(node) || node.body.type !== "BlockStatement") {
    return undefined;
  }

  for (const statement of node.body.body) {
    const directive = getDirective(statement);

    if (directive === undefined) {
      break;
    }

    if (directive === "use server") {
      return statement;
    }
  }

  return undefined;
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

export function getFunctionName(node: TSESTree.Node): string {
  if (
    (node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression") &&
    node.id !== null
  ) {
    return node.id.name;
  }

  return "server function";
}

export function getRootIdentifier(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "MemberExpression") {
    return getRootIdentifier(node.object);
  }

  if (node.type === "ChainExpression") {
    return getRootIdentifier(node.expression);
  }

  return undefined;
}

export function getChildNodes(node: TSESTree.Node): TSESTree.Node[] {
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
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

export function visitFunctionBody(
  root: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(root);

  for (const child of getChildNodes(root)) {
    if (child !== root && isFunctionNode(child)) {
      continue;
    }

    visitFunctionBody(child, callback);
  }
}

function getDirective(node: TSESTree.Node): string | undefined {
  if (
    node.type !== "ExpressionStatement" ||
    node.expression.type !== "Literal" ||
    typeof node.expression.value !== "string"
  ) {
    return undefined;
  }

  return node.expression.value;
}

function getImportedName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
}

function collectBoundNames(node: TSESTree.Node, names: Set<string>): void {
  switch (node.type) {
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      names.add(node.local.name);
      return;

    case "VariableDeclarator":
      collectPatternBindings(node.id, names);
      return;

    case "FunctionDeclaration":
      if (node.id !== null) {
        names.add(node.id.name);
      }
      for (const parameter of node.params) {
        collectPatternBindings(parameter, names);
      }
      return;

    case "FunctionExpression":
      if (node.id !== null) {
        names.add(node.id.name);
      }
      for (const parameter of node.params) {
        collectPatternBindings(parameter, names);
      }
      return;

    case "ArrowFunctionExpression":
      for (const parameter of node.params) {
        collectPatternBindings(parameter, names);
      }
      return;

    case "ClassDeclaration":
    case "ClassExpression":
      if (node.id !== null) {
        names.add(node.id.name);
      }
      return;

    case "CatchClause":
      if (node.param !== null) {
        collectPatternBindings(node.param, names);
      }
      return;

    default:
      return;
  }
}

function collectPatternBindings(
  node: TSESTree.Node,
  names: Set<string>,
): void {
  switch (node.type) {
    case "Identifier":
      names.add(node.name);
      return;

    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "Property") {
          collectPatternBindings(property.value, names);
        } else {
          collectPatternBindings(property.argument, names);
        }
      }
      return;

    case "ArrayPattern":
      for (const element of node.elements) {
        if (element !== null) {
          collectPatternBindings(element, names);
        }
      }
      return;

    case "AssignmentPattern":
      collectPatternBindings(node.left, names);
      return;

    case "RestElement":
      collectPatternBindings(node.argument, names);
      return;

    case "TSParameterProperty":
      collectPatternBindings(node.parameter, names);
      return;

    default:
      return;
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}
