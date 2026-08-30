import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type {
  TaintFlowAdapter,
  TaintKind,
  TaintSanitizer,
  TaintSink,
  TaintSource,
} from "../../flow";
import type {
  SecuritySanitizerKind,
  SecuritySinkKind,
} from "../../model/types";

const ALL_INJECTION_KINDS: readonly TaintKind[] = [
  "command",
  "sql",
  "nosql",
  "template",
  "expression",
  "crlf",
  "header",
  "ldap",
  "xpath",
  "graphql",
];

const REQUEST_ROOTS = new Set(["req", "request", "ctx", "event"]);
const REQUEST_SEGMENTS = new Set([
  "query",
  "body",
  "params",
  "headers",
  "cookies",
  "queryStringParameters",
  "pathParameters",
]);
const HEADER_OBJECTS = new Set(["res", "response", "reply", "headers"]);
const SQL_OBJECTS = new Set([
  "db",
  "database",
  "client",
  "pool",
  "connection",
  "sequelize",
  "knex",
  "prisma",
]);
const NOSQL_OBJECTS = new Set(["collection", "mongo", "mongoose", "model"]);
const LDAP_OBJECTS = new Set(["ldap", "ldapClient"]);
const XPATH_OBJECTS = new Set(["xpath", "document"]);
const COMMAND_METHODS = new Set([
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "spawn",
  "spawnSync",
]);
const SQL_METHODS = new Set([
  "query",
  "execute",
  "raw",
  "$queryRawUnsafe",
  "$executeRawUnsafe",
]);
const HEADER_METHODS = new Set(["setHeader", "appendHeader", "header", "set"]);
const TEMPLATE_METHODS = new Set(["render", "compile", "renderFile"]);
const EXPRESSION_METHODS = new Set(["eval", "evaluate", "parse"]);
const GRAPHQL_METHODS = new Set(["graphql", "graphqlSync"]);

interface ImportedCallable {
  readonly module: string;
  readonly imported: string;
}

interface ModelState {
  readonly namespaces: ReadonlyMap<string, string>;
  readonly callables: ReadonlyMap<string, ImportedCallable>;
}

interface SanitizerDescriptor {
  readonly kind: SecuritySanitizerKind;
  readonly clears: readonly TaintKind[];
  readonly argumentIndex: number;
  readonly label: string;
}

export function createInjectionFlowAdapter(
  ast: TSESTree.Program,
): TaintFlowAdapter {
  const state = buildModelState(ast);

  return {
    matchSource: (node) => matchSource(node),
    matchSanitizer: (node) => matchSanitizer(node, state),
    matchSinks: (node) => matchSinks(node, state),
  };
}

function matchSource(node: TSESTree.Node): TaintSource | undefined {
  const path = memberPath(node);
  if (path !== undefined && isRequestPath(path)) {
    return {
      node,
      label: `Request-controlled input: ${path.join(".")}`,
      sourceKind: "request-input",
      kinds: ALL_INJECTION_KINDS,
    };
  }

  if (node.type !== "CallExpression") {
    return undefined;
  }

  const calleePath = memberPath(node.callee);
  if (calleePath === undefined) {
    return undefined;
  }

  const root = calleePath[0];
  const method = calleePath[calleePath.length - 1];
  if (
    root !== undefined &&
    REQUEST_ROOTS.has(root) &&
    (method === "get" || method === "header")
  ) {
    return {
      node,
      label: `Request-controlled input: ${calleePath.join(".")}()`,
      sourceKind: "request-input",
      kinds: ALL_INJECTION_KINDS,
    };
  }

  if (
    calleePath.length >= 2 &&
    calleePath[calleePath.length - 2] === "searchParams" &&
    method === "get"
  ) {
    return {
      node,
      label: "URL query parameter input",
      sourceKind: "user-input",
      kinds: ALL_INJECTION_KINDS,
    };
  }

  return undefined;
}

function matchSanitizer(
  node: TSESTree.CallExpression,
  state: ModelState,
): TaintSanitizer | undefined {
  const descriptor = sanitizerDescriptor(node.callee, state);
  if (descriptor === undefined) {
    return undefined;
  }

  return {
    node,
    label: descriptor.label,
    sanitizerKind: descriptor.kind,
    clears: descriptor.clears,
    argumentIndex: descriptor.argumentIndex,
  };
}

function sanitizerDescriptor(
  callee: TSESTree.Node,
  state: ModelState,
): SanitizerDescriptor | undefined {
  if (callee.type === "Identifier" && callee.name === "encodeURIComponent") {
    return {
      kind: "crlf-rejection",
      clears: ["crlf", "header"],
      argumentIndex: 0,
      label: "Percent-encode header-controlled input",
    };
  }

  const identity = callableIdentity(callee, state);
  if (identity === undefined) {
    return undefined;
  }

  if (identity.module === "shell-quote" && identity.imported === "quote") {
    return {
      kind: "command-escape",
      clears: ["command"],
      argumentIndex: 0,
      label: "Shell argument escaping",
    };
  }

  if (identity.module === "sqlstring" && identity.imported === "escape") {
    return {
      kind: "parameterized-query",
      clears: ["sql"],
      argumentIndex: 0,
      label: "SQL escaping",
    };
  }

  if (
    identity.module === "mongo-sanitize" &&
    (identity.imported === "default" || identity.imported === "sanitize")
  ) {
    return {
      kind: "schema-validation",
      clears: ["nosql"],
      argumentIndex: 0,
      label: "Mongo query sanitization",
    };
  }

  if (
    identity.module === "ldap-filter-escape" &&
    (identity.imported === "default" || identity.imported === "escape")
  ) {
    return {
      kind: "ldap-escape",
      clears: ["ldap"],
      argumentIndex: 0,
      label: "LDAP filter escaping",
    };
  }

  if (
    identity.module === "xpath-escape" &&
    (identity.imported === "default" || identity.imported === "escape")
  ) {
    return {
      kind: "xpath-escape",
      clears: ["xpath"],
      argumentIndex: 0,
      label: "XPath literal escaping",
    };
  }

  return undefined;
}

function matchSinks(
  node: TSESTree.CallExpression,
  state: ModelState,
): readonly TaintSink[] {
  const sinks: TaintSink[] = [];
  const identity = callableIdentity(node.callee, state);
  const calleePath = memberPath(node.callee);
  const method = calleePath?.[calleePath.length - 1];
  const root = calleePath?.[0];

  if (isCommandIdentity(identity, calleePath, state)) {
    addArgumentSink(sinks, node, 0, "command", "shell-command", "Command execution");
  }

  if (
    method !== undefined &&
    root !== undefined &&
    SQL_OBJECTS.has(root) &&
    SQL_METHODS.has(method)
  ) {
    addArgumentSink(
      sinks,
      node,
      0,
      "sql",
      "sql-query",
      `SQL query via ${calleePath?.join(".")}`,
    );
  }

  if (method !== undefined && isNoSqlMethod(method)) {
    const first = expressionArgument(node, 0);
    if (first !== undefined) {
      const where = objectPropertyValue(first, "$where");
      if (where !== undefined) {
        sinks.push({
          family: "nosql",
          node,
          value: where,
          label: "MongoDB $where expression",
          sinkKind: "nosql-query",
        });
      } else if (root !== undefined && NOSQL_OBJECTS.has(root)) {
        sinks.push({
          family: "nosql",
          node,
          value: first,
          label: `NoSQL query via ${calleePath?.join(".")}`,
          sinkKind: "nosql-query",
        });
      }
    }
  }

  if (isTemplateIdentity(identity, calleePath, state)) {
    addArgumentSink(
      sinks,
      node,
      0,
      "template",
      "template-render",
      "Dynamic template source",
    );
  }

  if (isExpressionIdentity(identity, calleePath, state)) {
    addArgumentSink(
      sinks,
      node,
      0,
      "expression",
      "expression-evaluation",
      "Expression interpreter",
    );
  }

  if (
    method !== undefined &&
    root !== undefined &&
    HEADER_OBJECTS.has(root) &&
    HEADER_METHODS.has(method)
  ) {
    addArgumentSink(
      sinks,
      node,
      0,
      "header",
      "response-header",
      "Response header name",
    );
    addArgumentSink(
      sinks,
      node,
      1,
      "crlf",
      "response-header",
      "Response header value",
    );
  }

  if (method === "search" && root !== undefined && LDAP_OBJECTS.has(root)) {
    const options = expressionArgument(node, 1) ?? expressionArgument(node, 0);
    if (options !== undefined) {
      sinks.push({
        family: "ldap",
        node,
        value: objectPropertyValue(options, "filter") ?? options,
        label: "LDAP search filter",
        sinkKind: "ldap-query",
      });
    }
  }

  if (
    method !== undefined &&
    root !== undefined &&
    XPATH_OBJECTS.has(root) &&
    (method === "select" || method === "evaluate")
  ) {
    addArgumentSink(
      sinks,
      node,
      0,
      "xpath",
      "xpath-query",
      "XPath expression",
    );
  }

  if (isGraphqlIdentity(identity, calleePath, state)) {
    const first = expressionArgument(node, 0);
    if (first !== undefined && first.type === "ObjectExpression") {
      const source = objectPropertyValue(first, "source");
      if (source !== undefined) {
        sinks.push({
          family: "graphql",
          node,
          value: source,
          label: "GraphQL operation document",
          sinkKind: "graphql-query",
        });
      }
    } else {
      addArgumentSink(
        sinks,
        node,
        1,
        "graphql",
        "graphql-query",
        "GraphQL operation document",
      );
      if (node.arguments.length === 1) {
        addArgumentSink(
          sinks,
          node,
          0,
          "graphql",
          "graphql-query",
          "GraphQL operation document",
        );
      }
    }
  }

  return sinks;
}

function addArgumentSink(
  output: TaintSink[],
  node: TSESTree.CallExpression,
  index: number,
  family: TaintKind,
  sinkKind: SecuritySinkKind,
  label: string,
): void {
  const value = expressionArgument(node, index);
  if (value === undefined) {
    return;
  }

  output.push({ family, node, value, label, sinkKind });
}

function buildModelState(ast: TSESTree.Program): ModelState {
  const namespaces = new Map<string, string>();
  const callables = new Map<string, ImportedCallable>();

  visit(ast, (node) => {
    if (node.type === "ImportDeclaration") {
      const module = stringLiteralValue(node.source);
      if (module === undefined) {
        return;
      }

      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") {
          namespaces.set(specifier.local.name, module);
          continue;
        }

        if (specifier.type === "ImportDefaultSpecifier") {
          namespaces.set(specifier.local.name, module);
          callables.set(specifier.local.name, { module, imported: "default" });
          continue;
        }

        const imported = nodeName(specifier.imported);
        if (imported !== undefined) {
          callables.set(specifier.local.name, { module, imported });
        }
      }
      return;
    }

    if (node.type !== "VariableDeclarator" || node.init === null) {
      return;
    }

    const requiredModule = requireModule(node.init);
    if (requiredModule !== undefined) {
      if (node.id.type === "Identifier") {
        namespaces.set(node.id.name, requiredModule);
        return;
      }

      if (node.id.type === "ObjectPattern") {
        for (const property of node.id.properties) {
          if (property.type === "RestElement" || property.value.type !== "Identifier") {
            continue;
          }
          const imported = propertyName(property.key, property.computed);
          if (imported !== undefined) {
            callables.set(property.value.name, { module: requiredModule, imported });
          }
        }
      }
      return;
    }

    if (node.id.type !== "Identifier") {
      return;
    }

    const identity = callableIdentity(node.init, { namespaces, callables });
    if (identity !== undefined) {
      callables.set(node.id.name, identity);
      return;
    }

    const module = namespaceIdentity(node.init, namespaces);
    if (module !== undefined) {
      namespaces.set(node.id.name, module);
    }
  });

  return { namespaces, callables };
}

function callableIdentity(
  node: TSESTree.Node,
  state: ModelState,
): ImportedCallable | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Identifier") {
    return state.callables.get(expression.name);
  }

  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const path = memberPath(expression);
  if (path === undefined || path.length < 2) {
    return undefined;
  }

  const namespace = path[0];
  const imported = path[path.length - 1];
  if (namespace === undefined || imported === undefined) {
    return undefined;
  }

  const module = state.namespaces.get(namespace);
  return module === undefined ? undefined : { module, imported };
}

function namespaceIdentity(
  node: TSESTree.Node,
  namespaces: ReadonlyMap<string, string>,
): string | undefined {
  const expression = unwrapChain(node);
  return expression.type === "Identifier"
    ? namespaces.get(expression.name)
    : undefined;
}

function isCommandIdentity(
  identity: ImportedCallable | undefined,
  calleePath: readonly string[] | undefined,
  state: ModelState,
): boolean {
  if (identity !== undefined && isChildProcessModule(identity.module)) {
    return COMMAND_METHODS.has(identity.imported);
  }

  return namespaceMethodMatches(
    calleePath,
    state,
    isChildProcessModule,
    COMMAND_METHODS,
  );
}

function isTemplateIdentity(
  identity: ImportedCallable | undefined,
  calleePath: readonly string[] | undefined,
  state: ModelState,
): boolean {
  if (identity !== undefined && isTemplateModule(identity.module)) {
    return identity.imported === "default" || TEMPLATE_METHODS.has(identity.imported);
  }

  return namespaceMethodMatches(
    calleePath,
    state,
    isTemplateModule,
    TEMPLATE_METHODS,
  );
}

function isExpressionIdentity(
  identity: ImportedCallable | undefined,
  calleePath: readonly string[] | undefined,
  state: ModelState,
): boolean {
  if (identity !== undefined && isExpressionModule(identity.module)) {
    return identity.imported === "default" || EXPRESSION_METHODS.has(identity.imported);
  }

  return namespaceMethodMatches(
    calleePath,
    state,
    isExpressionModule,
    EXPRESSION_METHODS,
  );
}

function isGraphqlIdentity(
  identity: ImportedCallable | undefined,
  calleePath: readonly string[] | undefined,
  state: ModelState,
): boolean {
  if (identity !== undefined && identity.module === "graphql") {
    return GRAPHQL_METHODS.has(identity.imported);
  }

  return namespaceMethodMatches(
    calleePath,
    state,
    (module) => module === "graphql",
    GRAPHQL_METHODS,
  );
}

function namespaceMethodMatches(
  calleePath: readonly string[] | undefined,
  state: ModelState,
  modulePredicate: (module: string) => boolean,
  methods: ReadonlySet<string>,
): boolean {
  if (calleePath === undefined || calleePath.length < 2) {
    return false;
  }

  const root = calleePath[0];
  const method = calleePath[calleePath.length - 1];
  if (root === undefined || method === undefined || !methods.has(method)) {
    return false;
  }

  const module = state.namespaces.get(root);
  return module !== undefined && modulePredicate(module);
}

function isRequestPath(path: readonly string[]): boolean {
  const root = path[0];
  if (root === undefined || !REQUEST_ROOTS.has(root)) {
    return false;
  }

  return path.some((segment, index) => index > 0 && REQUEST_SEGMENTS.has(segment));
}

function isNoSqlMethod(method: string): boolean {
  return new Set([
    "find",
    "findOne",
    "updateOne",
    "deleteOne",
    "findOneAndUpdate",
    "aggregate",
  ]).has(method);
}

function isChildProcessModule(module: string): boolean {
  return module === "child_process" || module === "node:child_process";
}

function isTemplateModule(module: string): boolean {
  return new Set(["ejs", "pug", "handlebars", "mustache", "nunjucks"]).has(module);
}

function isExpressionModule(module: string): boolean {
  return new Set(["jexl", "mathjs", "expr-eval", "jsonata"]).has(module);
}

function requireModule(node: TSESTree.Node): string | undefined {
  const expression = unwrapChain(node);
  if (
    expression.type !== "CallExpression" ||
    expression.callee.type !== "Identifier" ||
    expression.callee.name !== "require"
  ) {
    return undefined;
  }

  const first = expression.arguments[0];
  return first === undefined || first.type === "SpreadElement"
    ? undefined
    : stringLiteralValue(first);
}

function expressionArgument(
  node: TSESTree.CallExpression,
  index: number,
): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : argument;
}

function objectPropertyValue(
  node: TSESTree.Node,
  expected: string,
): TSESTree.Node | undefined {
  if (node.type !== "ObjectExpression") {
    return undefined;
  }

  for (const property of node.properties) {
    if (property.type === "SpreadElement") {
      continue;
    }

    if (propertyName(property.key, property.computed) === expected) {
      return property.value;
    }
  }

  return undefined;
}

function memberPath(node: TSESTree.Node): readonly string[] | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Identifier") {
    return [expression.name];
  }

  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const object = memberPath(expression.object);
  const property = propertyName(expression.property, expression.computed);
  return object === undefined || property === undefined
    ? undefined
    : [...object, property];
}

function propertyName(node: TSESTree.Node, computed: boolean): string | undefined {
  if (!computed && node.type === "Identifier") {
    return node.name;
  }
  return stringLiteralValue(node);
}

function nodeName(node: TSESTree.Node): string | undefined {
  return node.type === "Identifier" ? node.name : stringLiteralValue(node);
}

function stringLiteralValue(node: TSESTree.Node): string | undefined {
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}

function unwrapChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === "ChainExpression" ? node.expression : node;
}

function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void {
  visitor(node);

  const children: TSESTree.Node[] = [];
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    }
  }

  children.sort((left, right) => (
    (left.range?.[0] ?? Number.MAX_SAFE_INTEGER) -
    (right.range?.[0] ?? Number.MAX_SAFE_INTEGER)
  ));

  for (const child of children) {
    visit(child, visitor);
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value &&
    typeof value.type === "string";
}
