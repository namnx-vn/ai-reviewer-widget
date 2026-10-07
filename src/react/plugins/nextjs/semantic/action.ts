import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type ServerActionFunction =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression;

export interface ServerAction {
  readonly node: ServerActionFunction;
  readonly parameterNames: ReadonlySet<string>;
}

const MUTATION_METHODS = new Set([
  "create",
  "delete",
  "deleteMany",
  "destroy",
  "insert",
  "insertMany",
  "remove",
  "replace",
  "replaceOne",
  "save",
  "update",
  "updateMany",
  "updateOne",
  "upsert",
]);

export function collectServerActions(ast: TSESTree.Program): readonly ServerAction[] {
  const actions: ServerActionFunction[] = [];

  if (hasDirective(ast.body, "use server")) {
    actions.push(...collectModuleActions(ast));
  }

  visit(ast, (node) => {
    if (isFunction(node) && node.async && hasFunctionDirective(node, "use server")) {
      actions.push(node);
    }
  });

  const seen = new Set<TSESTree.Node>();
  return actions
    .filter((action) => {
      if (seen.has(action)) return false;
      seen.add(action);
      return true;
    })
    .map((node) => ({ node, parameterNames: collectParameterNames(node.params) }));
}

export function actionContainingNode(
  actions: readonly ServerAction[],
  node: TSESTree.Node,
): ServerAction | undefined {
  return actions.find((action) => containsNode(action.node, node));
}

export function isEstablishedMutationCall(node: TSESTree.CallExpression): boolean {
  const path = callPath(node);
  if (path === undefined) return false;

  const segments = path.split(".");
  const method = segments[segments.length - 1];
  if (method === undefined || !MUTATION_METHODS.has(method)) return false;

  return segments.slice(0, -1).some((segment) => (
    /^(?:database|db|prisma|repo|repository)$/i.test(segment) ||
    /(?:Repo|Repository)$/.test(segment)
  ));
}

export function mutationMethod(node: TSESTree.CallExpression): string | undefined {
  const path = callPath(node);
  const segments = path?.split(".");
  return segments?.[segments.length - 1];
}

export function firstCallArgument(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const argument = node.arguments[0];
  return argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : argument;
}

export function propertyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}

export function memberPropertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  return node.computed ? propertyName(node.property) : undefined;
}

export function callPath(node: TSESTree.CallExpression): string | undefined {
  return expressionPath(node.callee);
}

export function directActionReturns(action: ServerAction): readonly TSESTree.Node[] {
  if (action.node.body.type !== "BlockStatement") return [action.node.body];

  const returned: TSESTree.Node[] = [];
  visitWithoutNestedFunctions(action.node.body, (node) => {
    if (node.type === "ReturnStatement" && node.argument !== null) {
      returned.push(node.argument);
    }
  });
  return returned;
}

export function visit(
  node: TSESTree.Node,
  callback: (child: TSESTree.Node) => void,
): void {
  callback(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, callback);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) visit(item, callback);
      }
    }
  }
}

function collectModuleActions(ast: TSESTree.Program): readonly ServerActionFunction[] {
  const localFunctions = collectTopLevelFunctions(ast);
  const actions: ServerActionFunction[] = [];

  for (const statement of ast.body) {
    if (statement.type === "ExportNamedDeclaration") {
      if (statement.declaration !== null) {
        actions.push(...functionsFromDeclaration(statement.declaration));
      }
      for (const specifier of statement.specifiers) {
        if (specifier.local.type !== "Identifier") continue;
        const action = localFunctions.get(specifier.local.name);
        if (action !== undefined) actions.push(action);
      }
    }

    if (statement.type === "ExportDefaultDeclaration" && isFunction(statement.declaration)) {
      actions.push(statement.declaration);
    }
  }

  return actions.filter((action) => action.async);
}

function collectTopLevelFunctions(ast: TSESTree.Program): ReadonlyMap<string, ServerActionFunction> {
  const functions = new Map<string, ServerActionFunction>();
  for (const statement of ast.body) {
    if (statement.type === "FunctionDeclaration" && statement.id !== null) {
      functions.set(statement.id.name, statement);
    }
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) {
      if (
        declaration.id.type === "Identifier" &&
        declaration.init !== null &&
        isFunction(declaration.init)
      ) {
        functions.set(declaration.id.name, declaration.init);
      }
    }
  }
  return functions;
}

function functionsFromDeclaration(node: TSESTree.Node): readonly ServerActionFunction[] {
  if (isFunction(node)) return [node];
  if (node.type !== "VariableDeclaration") return [];

  return node.declarations.flatMap((declaration) => (
    declaration.init !== null && isFunction(declaration.init)
      ? [declaration.init]
      : []
  ));
}

function hasFunctionDirective(action: ServerActionFunction, directive: string): boolean {
  return action.body.type === "BlockStatement" && hasDirective(action.body.body, directive);
}

function hasDirective(
  statements: readonly TSESTree.ProgramStatement[],
  directive: string,
): boolean {
  const first = statements[0];
  return first?.type === "ExpressionStatement" &&
    first.expression.type === "Literal" &&
    first.expression.value === directive;
}

function collectParameterNames(params: readonly TSESTree.Parameter[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const parameter of params) collectPatternNames(parameter, names);
  return names;
}

function collectPatternNames(node: TSESTree.Node, names: Set<string>): void {
  if (node.type === "Identifier") {
    names.add(node.name);
    return;
  }
  if (node.type === "AssignmentPattern") {
    collectPatternNames(node.left, names);
    return;
  }
  if (node.type === "RestElement") {
    collectPatternNames(node.argument, names);
    return;
  }
  if (node.type === "ArrayPattern") {
    for (const element of node.elements) {
      if (element !== null) collectPatternNames(element, names);
    }
    return;
  }
  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      collectPatternNames(
        property.type === "Property" ? property.value : property.argument,
        names,
      );
    }
  }
}

function containsNode(container: TSESTree.Node, node: TSESTree.Node): boolean {
  if (container === node) return true;
  if (container.range === undefined || node.range === undefined) return false;
  return container.range[0] <= node.range[0] && container.range[1] >= node.range[1];
}

function expressionPath(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression") return undefined;
  const object = expressionPath(node.object);
  const property = memberPropertyName(node);
  return object === undefined || property === undefined
    ? undefined
    : `${object}.${property}`;
}

function visitWithoutNestedFunctions(
  node: TSESTree.Node,
  callback: (child: TSESTree.Node) => void,
): void {
  callback(node);
  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (!isNode(child) || isFunction(child)) continue;
      visitWithoutNestedFunctions(child, callback);
    }
  }
}

function isFunction(node: TSESTree.Node): node is ServerActionFunction {
  return node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression";
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string";
}
