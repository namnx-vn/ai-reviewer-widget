import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReactRuleContext } from "../../../engine/react-rule";

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

export interface NextCacheRequestAccess {
  readonly api: "connection" | "cookies" | "draftMode" | "headers";
  readonly call: TSESTree.CallExpression;
}

export interface NextCacheTagReference {
  readonly tag: string;
  readonly call: TSESTree.CallExpression;
}

export interface NextCacheMutationAction {
  readonly action: FunctionNode;
  readonly mutation: TSESTree.CallExpression;
  readonly cachedTags: readonly string[];
  readonly invalidations: readonly TSESTree.CallExpression[];
  readonly invalidatedTags: readonly string[];
}

export interface NextCacheModuleAnalysis {
  readonly requestAccesses: readonly NextCacheRequestAccess[];
  readonly cacheTags: readonly NextCacheTagReference[];
  readonly mutationActions: readonly NextCacheMutationAction[];
}

interface ImportBindings {
  readonly requestFunctions: ReadonlyMap<string, NextCacheRequestAccess["api"]>;
  readonly requestNamespaces: ReadonlySet<string>;
  readonly cacheFunctions: ReadonlyMap<string, CacheFunctionName>;
  readonly cacheNamespaces: ReadonlySet<string>;
  readonly prismaConstructors: ReadonlySet<string>;
}

interface PrismaDataDependency {
  readonly client: string;
  readonly model: string;
  readonly tags: readonly string[];
}

interface PrismaCallTarget {
  readonly client: string;
  readonly model: string;
  readonly call: TSESTree.CallExpression;
}

type CacheFunctionName =
  | "cacheTag"
  | "refresh"
  | "revalidateTag"
  | "updateTag";

const REQUEST_APIS = new Set<NextCacheRequestAccess["api"]>([
  "connection",
  "cookies",
  "draftMode",
  "headers",
]);
const INVALIDATION_APIS = new Set<CacheFunctionName>([
  "refresh",
  "revalidateTag",
  "updateTag",
]);
const PRISMA_MUTATION_METHODS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);
const PRISMA_READ_METHODS = new Set([
  "aggregate",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);
const analysisCache = new WeakMap<TSESTree.Program, NextCacheModuleAnalysis>();

/** Builds only relationships that are statically established inside one module. */
export function analyzeNextCacheModule(
  context: ReactRuleContext,
): NextCacheModuleAnalysis {
  const cached = analysisCache.get(context.ast);
  if (cached !== undefined) {
    return cached;
  }

  const imports = collectImportBindings(context.ast);
  const topLevelPrismaClients = collectTopLevelPrismaClients(
    context.ast,
    imports.prismaConstructors,
  );
  const cachedFunctions = collectBoundaryFunctions(
    context.ast,
    "use cache",
  );
  const actionFunctions = collectBoundaryFunctions(
    context.ast,
    "use server",
  );
  const requestAccesses: NextCacheRequestAccess[] = [];
  const cacheTags: NextCacheTagReference[] = [];
  const dataDependencies: PrismaDataDependency[] = [];
  const mutationActions: NextCacheMutationAction[] = [];

  for (const boundary of cachedFunctions) {
    const localBindings = collectFunctionLocalBindings(boundary);
    const localPrismaClients = collectFunctionPrismaClients(
      boundary,
      imports.prismaConstructors,
    );
    const prismaClients = new Set(
      [...topLevelPrismaClients].filter((name) => !localBindings.has(name)),
    );
    for (const name of localPrismaClients) {
      prismaClients.add(name);
    }
    const boundaryTags: NextCacheTagReference[] = [];
    const boundaryReads: PrismaCallTarget[] = [];

    visitFunctionBody(boundary.body, (node) => {
      if (node.type !== "CallExpression") {
        return;
      }

      const requestApi = getImportedCallName(
        node,
        imports.requestFunctions,
        imports.requestNamespaces,
        localBindings,
      );
      if (requestApi !== undefined && REQUEST_APIS.has(requestApi)) {
        requestAccesses.push({ api: requestApi, call: node });
      }

      const cacheApi = getImportedCallName(
        node,
        imports.cacheFunctions,
        imports.cacheNamespaces,
        localBindings,
      );
      if (cacheApi === "cacheTag") {
        const tag = getStaticString(node.arguments[0]);
        if (tag !== undefined) {
          const reference = { tag, call: node };
          cacheTags.push(reference);
          boundaryTags.push(reference);
        }
      }

      const read = getPrismaCallTarget(node, prismaClients, PRISMA_READ_METHODS);
      if (read !== undefined) {
        boundaryReads.push(read);
      }
    });

    for (const read of boundaryReads) {
      dataDependencies.push({
        client: read.client,
        model: read.model,
        tags: boundaryTags.map((entry) => entry.tag),
      });
    }
  }

  for (const action of actionFunctions) {
    const localBindings = collectFunctionLocalBindings(action);
    const localPrismaClients = collectFunctionPrismaClients(
      action,
      imports.prismaConstructors,
    );
    const prismaClients = new Set(
      [...topLevelPrismaClients].filter((name) => !localBindings.has(name)),
    );
    for (const name of localPrismaClients) {
      prismaClients.add(name);
    }

    const mutations: PrismaCallTarget[] = [];
    const invalidations: TSESTree.CallExpression[] = [];
    const invalidatedTags: string[] = [];

    visitFunctionBody(action.body, (node) => {
      if (node.type !== "CallExpression") {
        return;
      }

      const mutation = getPrismaCallTarget(
        node,
        prismaClients,
        PRISMA_MUTATION_METHODS,
      );
      if (mutation !== undefined) {
        mutations.push(mutation);
      }

      const cacheApi = getImportedCallName(
        node,
        imports.cacheFunctions,
        imports.cacheNamespaces,
        localBindings,
      );
      if (cacheApi === undefined || !INVALIDATION_APIS.has(cacheApi)) {
        return;
      }

      invalidations.push(node);
      if (cacheApi !== "refresh") {
        const tag = getStaticString(node.arguments[0]);
        if (tag !== undefined) {
          invalidatedTags.push(tag);
        }
      }
    });

    const relatedMutation = mutations.find((mutation) =>
      dataDependencies.some(
        (dependency) =>
          dependency.client === mutation.client &&
          dependency.model === mutation.model,
      ),
    );
    if (relatedMutation !== undefined) {
      const cachedTags = dataDependencies
        .filter(
          (dependency) =>
            dependency.client === relatedMutation.client &&
            dependency.model === relatedMutation.model,
        )
        .flatMap((dependency) => dependency.tags);
      mutationActions.push({
        action,
        mutation: relatedMutation.call,
        cachedTags: [...new Set(cachedTags)],
        invalidations,
        invalidatedTags,
      });
    }
  }

  const result: NextCacheModuleAnalysis = {
    requestAccesses: deduplicateByNode(requestAccesses, (entry) => entry.call),
    cacheTags: deduplicateByNode(cacheTags, (entry) => entry.call),
    mutationActions,
  };
  analysisCache.set(context.ast, result);
  return result;
}

function collectImportBindings(ast: TSESTree.Program): ImportBindings {
  const requestFunctions = new Map<string, NextCacheRequestAccess["api"]>();
  const requestNamespaces = new Set<string>();
  const cacheFunctions = new Map<string, CacheFunctionName>();
  const cacheNamespaces = new Set<string>();
  const prismaConstructors = new Set<string>();

  for (const statement of ast.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") {
      continue;
    }

    const source = getImportSource(statement);
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier") {
        if (source === "next/headers" || source === "next/server") {
          requestNamespaces.add(specifier.local.name);
        }
        if (source === "next/cache") {
          cacheNamespaces.add(specifier.local.name);
        }
        continue;
      }

      if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") {
        continue;
      }

      const importedName = getImportedName(specifier.imported);
      if (
        importedName !== undefined &&
        (source === "next/headers" || source === "next/server") &&
        REQUEST_APIS.has(importedName as NextCacheRequestAccess["api"])
      ) {
        requestFunctions.set(
          specifier.local.name,
          importedName as NextCacheRequestAccess["api"],
        );
      }

      if (
        importedName !== undefined &&
        source === "next/cache" &&
        (importedName === "cacheTag" || INVALIDATION_APIS.has(importedName as CacheFunctionName))
      ) {
        cacheFunctions.set(specifier.local.name, importedName as CacheFunctionName);
      }

      if (source === "@prisma/client" && importedName === "PrismaClient") {
        prismaConstructors.add(specifier.local.name);
      }
    }
  }

  return {
    requestFunctions,
    requestNamespaces,
    cacheFunctions,
    cacheNamespaces,
    prismaConstructors,
  };
}

function collectBoundaryFunctions(
  ast: TSESTree.Program,
  directive: "use cache" | "use server",
): ReadonlySet<FunctionNode> {
  const functions = new Set<FunctionNode>();

  visit(ast, (node) => {
    if (isFunctionNode(node) && hasFunctionDirective(node, directive)) {
      functions.add(node);
    }
  });

  if (hasDirective(ast.body, directive)) {
    for (const statement of ast.body) {
      const exported = getExportedFunction(statement);
      if (exported !== undefined) {
        functions.add(exported);
      }
    }
  }

  return functions;
}

function collectTopLevelPrismaClients(
  ast: TSESTree.Program,
  constructors: ReadonlySet<string>,
): ReadonlySet<string> {
  const names = new Set<string>();

  for (const statement of ast.body) {
    collectPrismaClientFromStatement(statement, constructors, names);
  }

  return names;
}

function collectFunctionPrismaClients(
  fn: FunctionNode,
  constructors: ReadonlySet<string>,
): ReadonlySet<string> {
  const names = new Set<string>();

  if (fn.body.type !== "BlockStatement") {
    return names;
  }

  visitFunctionBody(fn.body, (node) => {
    if (node.type === "VariableDeclaration") {
      collectPrismaClientFromVariableDeclaration(node, constructors, names);
    }
  });

  return names;
}

function collectPrismaClientFromStatement(
  statement: TSESTree.ProgramStatement,
  constructors: ReadonlySet<string>,
  names: Set<string>,
): void {
  if (statement.type === "VariableDeclaration") {
    collectPrismaClientFromVariableDeclaration(statement, constructors, names);
    return;
  }

  if (
    statement.type === "ExportNamedDeclaration" &&
    statement.declaration?.type === "VariableDeclaration"
  ) {
    collectPrismaClientFromVariableDeclaration(
      statement.declaration,
      constructors,
      names,
    );
  }
}

function collectPrismaClientFromVariableDeclaration(
  declaration: TSESTree.VariableDeclaration,
  constructors: ReadonlySet<string>,
  names: Set<string>,
): void {
  for (const declarator of declaration.declarations) {
    if (
      declarator.id.type === "Identifier" &&
      declarator.init?.type === "NewExpression" &&
      declarator.init.callee.type === "Identifier" &&
      constructors.has(declarator.init.callee.name)
    ) {
      names.add(declarator.id.name);
    }
  }
}

function collectFunctionLocalBindings(fn: FunctionNode): ReadonlySet<string> {
  const names = new Set<string>();

  for (const parameter of fn.params) {
    collectPatternNames(parameter, names);
  }

  if (fn.body.type !== "BlockStatement") {
    return names;
  }

  visitFunctionBody(fn.body, (node) => {
    if (node.type === "VariableDeclarator") {
      collectPatternNames(node.id, names);
    } else if (
      (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") &&
      node.id !== null
    ) {
      names.add(node.id.name);
    }
  });

  return names;
}

function getImportedCallName<T extends string>(
  call: TSESTree.CallExpression,
  namedBindings: ReadonlyMap<string, T>,
  namespaceBindings: ReadonlySet<string>,
  localBindings: ReadonlySet<string>,
): T | undefined {
  if (call.callee.type === "Identifier") {
    if (localBindings.has(call.callee.name)) {
      return undefined;
    }
    return namedBindings.get(call.callee.name);
  }

  if (
    call.callee.type !== "MemberExpression" ||
    call.callee.object.type !== "Identifier" ||
    localBindings.has(call.callee.object.name) ||
    !namespaceBindings.has(call.callee.object.name)
  ) {
    return undefined;
  }

  const propertyName = getPropertyName(call.callee);
  return propertyName === undefined
    ? undefined
    : [...namedBindings.values()].find((name) => name === propertyName) ?? propertyName as T;
}

function getPrismaCallTarget(
  call: TSESTree.CallExpression,
  prismaClients: ReadonlySet<string>,
  methods: ReadonlySet<string>,
): PrismaCallTarget | undefined {
  if (call.callee.type !== "MemberExpression") {
    return undefined;
  }

  const method = getPropertyName(call.callee);
  const root = getRootIdentifier(call.callee.object);
  const model = call.callee.object.type === "MemberExpression"
    ? getPropertyName(call.callee.object)
    : undefined;
  if (
    method === undefined ||
    !methods.has(method) ||
    root === undefined ||
    !prismaClients.has(root) ||
    model === undefined
  ) {
    return undefined;
  }

  return { client: root, model, call };
}

function getRootIdentifier(node: TSESTree.Node): string | undefined {
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

function getPropertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return node.computed ? getStaticString(node.property) : undefined;
}

function getExportedFunction(
  statement: TSESTree.ProgramStatement,
): FunctionNode | undefined {
  if (statement.type === "ExportDefaultDeclaration") {
    return isFunctionNode(statement.declaration)
      ? statement.declaration
      : undefined;
  }

  if (statement.type !== "ExportNamedDeclaration" || statement.declaration === null) {
    return undefined;
  }

  if (statement.declaration.type === "FunctionDeclaration") {
    return statement.declaration;
  }

  if (statement.declaration.type === "VariableDeclaration") {
    for (const declarator of statement.declaration.declarations) {
      if (declarator.init !== null && isFunctionNode(declarator.init)) {
        return declarator.init;
      }
    }
  }

  return undefined;
}

function hasFunctionDirective(
  fn: FunctionNode,
  directive: string,
): boolean {
  return fn.body.type === "BlockStatement" && hasDirective(fn.body.body, directive);
}

function hasDirective(
  statements: readonly TSESTree.Node[],
  directive: string,
): boolean {
  for (const statement of statements) {
    if (!isDirectiveStatement(statement)) {
      return false;
    }
    if (statement.expression.value === directive) {
      return true;
    }
  }
  return false;
}

function isDirectiveStatement(
  node: TSESTree.Node,
): node is TSESTree.ExpressionStatement & {
  readonly expression: TSESTree.StringLiteral;
} {
  return (
    node.type === "ExpressionStatement" &&
    node.expression.type === "Literal" &&
    typeof node.expression.value === "string"
  );
}

function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function getImportSource(node: TSESTree.ImportDeclaration): string | undefined {
  return typeof node.source.value === "string" ? node.source.value : undefined;
}

function getImportedName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}

function getStaticString(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
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
  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      collectPatternNames(
        property.type === "Property" ? property.value : property.argument,
        names,
      );
    }
    return;
  }
  if (node.type === "ArrayPattern") {
    for (const element of node.elements) {
      if (element !== null) {
        collectPatternNames(element, names);
      }
    }
    return;
  }
  if (node.type === "TSParameterProperty") {
    collectPatternNames(node.parameter, names);
  }
}

function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);
  for (const child of getChildNodes(node)) {
    visit(child, callback);
  }
}

function visitFunctionBody(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);
  for (const child of getChildNodes(node)) {
    if (isFunctionNode(child)) {
      callback(child);
      continue;
    }
    visitFunctionBody(child, callback);
  }
}

function getChildNodes(node: TSESTree.Node): readonly TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "range" || key === "tokens" || key === "comments") {
      continue;
    }
    if (isNode(value)) {
      children.push(value);
    } else if (Array.isArray(value)) {
      children.push(...value.filter(isNode));
    }
  }
  return children;
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function deduplicateByNode<T>(
  values: readonly T[],
  getNode: (value: T) => TSESTree.Node,
): readonly T[] {
  const seen = new Set<TSESTree.Node>();
  return values.filter((value) => {
    const node = getNode(value);
    if (seen.has(node)) {
      return false;
    }
    seen.add(node);
    return true;
  });
}
