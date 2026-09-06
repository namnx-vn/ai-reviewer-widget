import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ASTRule } from "../rules";

const SERVER_CACHE_TEARDOWN_RULE_ID = "quality.resource.server-cache-teardown";
const SNAPSHOT_TIME_RULE_ID = "quality.correctness.nondeterministic-snapshot-time";
const UNDEFINED_METHOD_GUARD_RULE_ID = "quality.correctness.undefined-method-guard";

const REQUIRED_QUERY_CLIENT_METHODS = [
  "mount",
  "unmount",
  "cancelQueries",
  "clear",
] as const;

const KNOWN_RUNTIME_GLOBALS = new Set([
  "AbortController",
  "AbortSignal",
  "Array",
  "Boolean",
  "console",
  "Date",
  "document",
  "Error",
  "fetch",
  "globalThis",
  "JSON",
  "Map",
  "Math",
  "navigator",
  "Number",
  "Object",
  "process",
  "Promise",
  "Reflect",
  "RegExp",
  "Response",
  "Set",
  "String",
  "Symbol",
  "TypeError",
  "undefined",
  "URL",
  "URLSearchParams",
  "WeakMap",
  "WeakSet",
  "window",
]);

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

interface NamedFunction {
  readonly name: string;
  readonly node: FunctionLike;
}

interface InterfaceMethods {
  readonly name: string;
  readonly methods: ReadonlySet<string>;
}

export const serverCacheTeardownRule: ASTRule = {
  id: SERVER_CACHE_TEARDOWN_RULE_ID,
  description:
    "Detect server/provider cache lifecycles that mount a query client but dispose it without canceling and clearing per-request state.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (!isNode(node) || node.type !== "Program") {
      return [];
    }

    const interfaces = collectInterfaceMethods(node);
    const findings: ReviewFinding[] = [];

    for (const candidate of collectNamedFunctions(node)) {
      if (!/(?:server|ssr|provider|render)/i.test(candidate.name)) {
        continue;
      }

      for (const parameter of candidate.node.params) {
        const client = typedIdentifierParameter(parameter);
        if (client === undefined) {
          continue;
        }

        const methods = interfaces.find((item) => item.name === client.typeName)?.methods;
        if (
          methods === undefined ||
          !REQUIRED_QUERY_CLIENT_METHODS.every((method) => methods.has(method)) ||
          !containsMethodCall(candidate.node.body, client.name, "mount")
        ) {
          continue;
        }

        for (const cleanup of collectCleanupRegistrations(candidate.node.body)) {
          if (
            !containsMethodCall(cleanup.callback.body, client.name, "unmount") ||
            (
              containsMethodCall(cleanup.callback.body, client.name, "cancelQueries") &&
              containsMethodCall(cleanup.callback.body, client.name, "clear")
            )
          ) {
            continue;
          }

          findings.push(createFinding(
            SERVER_CACHE_TEARDOWN_RULE_ID,
            file,
            cleanup.call,
            "Server cache teardown leaves per-request query state alive",
            "A server/provider lifecycle mounts a query client and unregisters it during cleanup, but does not cancel pending queries and clear captured cache state before disposal.",
            "Cancel pending queries and clear the per-request cache during server cleanup before or together with unmounting the client.",
          ));
        }
      }
    }

    return findings;
  },
};

export const nondeterministicSnapshotTimeRule: ASTRule = {
  id: SNAPSHOT_TIME_RULE_ID,
  description:
    "Detect Date.now() embedded directly in dehydration/serialization snapshot metadata.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (!isNode(node)) {
      return [];
    }

    const candidate = namedFunction(node);
    if (
      candidate === undefined ||
      !/(?:dehydrate|snapshot|serialize)/i.test(candidate.name)
    ) {
      return [];
    }

    const matches = collectTimestampDateNowCalls(candidate.node.body);
    return matches.map((match) => createFinding(
      SNAPSHOT_TIME_RULE_ID,
      file,
      match,
      "Snapshot serialization reads wall-clock time",
      "A dehydration or snapshot serializer writes Date.now() into snapshot metadata, making cached/prerendered output depend on the execution clock instead of the snapshot's deterministic time boundary.",
      "Pass the snapshot/cache timestamp into the serializer, or derive it from deterministic snapshot metadata rather than reading the wall clock inside the cached computation.",
    ));
  },
};

export const undefinedMethodGuardRule: ASTRule = {
  id: UNDEFINED_METHOD_GUARD_RULE_ID,
  description:
    "Detect class-method guard conditions that reference a bare identifier unavailable in method, module, or runtime scope.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (!isNode(node) || node.type !== "Program") {
      return [];
    }

    const moduleBindings = collectModuleBindings(node);
    const findings: ReviewFinding[] = [];

    visit(node, (child) => {
      if (
        child.type !== "MethodDefinition" ||
        child.value.type !== "FunctionExpression" ||
        child.value.body === null
      ) {
        return;
      }

      const method = child.value;
      const localBindings = collectFunctionBindings(method);
      const reported = new Set<string>();

      visitWithoutNestedFunctions(method.body, (methodNode) => {
        if (methodNode.type !== "IfStatement") {
          return;
        }

        for (const identifier of collectConditionIdentifiers(methodNode.test)) {
          if (
            localBindings.has(identifier.name) ||
            moduleBindings.has(identifier.name) ||
            KNOWN_RUNTIME_GLOBALS.has(identifier.name) ||
            reported.has(identifier.name)
          ) {
            continue;
          }

          reported.add(identifier.name);
          findings.push(createFinding(
            UNDEFINED_METHOD_GUARD_RULE_ID,
            file,
            identifier,
            "Method guard references an unavailable identifier",
            `The guard references ${identifier.name}, but that name is not a method parameter/local, module binding, or supported runtime global. The branch cannot typecheck or execute as written.`,
            "Add the value explicitly as a method parameter/local binding, or reference the intended instance/module value through its actual scope.",
          ));
        }
      });
    });

    return findings;
  },
};

function collectInterfaceMethods(program: TSESTree.Program): readonly InterfaceMethods[] {
  const result: InterfaceMethods[] = [];

  for (const statement of program.body) {
    if (statement.type !== "TSInterfaceDeclaration") {
      continue;
    }

    const methods = new Set<string>();
    for (const member of statement.body.body) {
      if (member.type !== "TSMethodSignature") {
        continue;
      }

      const name = propertyName(member.key, member.computed);
      if (name !== undefined) {
        methods.add(name);
      }
    }

    result.push({ name: statement.id.name, methods });
  }

  return result;
}

function typedIdentifierParameter(
  parameter: TSESTree.Parameter,
): { readonly name: string; readonly typeName: string } | undefined {
  if (parameter.type !== "Identifier") {
    return undefined;
  }

  const annotation = parameter.typeAnnotation?.typeAnnotation;
  if (
    annotation?.type !== "TSTypeReference" ||
    annotation.typeName.type !== "Identifier"
  ) {
    return undefined;
  }

  return { name: parameter.name, typeName: annotation.typeName.name };
}

function collectCleanupRegistrations(
  node: TSESTree.Node,
): readonly { readonly call: TSESTree.CallExpression; readonly callback: FunctionLike }[] {
  const cleanups: { call: TSESTree.CallExpression; callback: FunctionLike }[] = [];

  visit(node, (child) => {
    if (child.type !== "CallExpression") {
      return;
    }

    const name = callName(child);
    if (
      name !== "onCleanup" &&
      name !== "onDispose" &&
      name !== "onUnmount" &&
      name !== "registerCleanup"
    ) {
      return;
    }

    const callback = child.arguments[0];
    if (
      callback?.type === "ArrowFunctionExpression" ||
      callback?.type === "FunctionExpression"
    ) {
      cleanups.push({ call: child, callback });
    }
  });

  return cleanups;
}

function containsMethodCall(
  node: TSESTree.Node,
  objectName: string,
  methodName: string,
): boolean {
  let found = false;

  visit(node, (child) => {
    if (
      child.type === "CallExpression" &&
      child.callee.type === "MemberExpression" &&
      child.callee.object.type === "Identifier" &&
      child.callee.object.name === objectName &&
      propertyName(child.callee.property, child.callee.computed) === methodName
    ) {
      found = true;
    }
  });

  return found;
}

function collectTimestampDateNowCalls(node: TSESTree.Node): readonly TSESTree.CallExpression[] {
  const matches: TSESTree.CallExpression[] = [];

  visit(node, (child) => {
    if (child.type !== "ObjectExpression") {
      return;
    }

    for (const property of child.properties) {
      if (
        property.type !== "Property" ||
        property.computed ||
        !/(?:dehydratedAt|timestamp|createdAt|generatedAt|snapshotTime)/i.test(
          propertyName(property.key, false) ?? "",
        ) ||
        property.value.type !== "CallExpression" ||
        !isDateNowCall(property.value)
      ) {
        continue;
      }

      matches.push(property.value);
    }
  });

  return matches;
}

function isDateNowCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "Date" &&
    propertyName(node.callee.property, node.callee.computed) === "now"
  );
}

function collectModuleBindings(program: TSESTree.Program): ReadonlySet<string> {
  const names = new Set<string>();

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers) {
        names.add(specifier.local.name);
      }
      continue;
    }

    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        collectPatternNames(declaration.id, names);
      }
      continue;
    }

    if (
      (statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") &&
      statement.id !== null
    ) {
      names.add(statement.id.name);
    }
  }

  return names;
}

function collectFunctionBindings(node: TSESTree.FunctionExpression): ReadonlySet<string> {
  const names = new Set<string>();

  for (const parameter of node.params) {
    collectPatternNames(parameter, names);
  }

  visitWithoutNestedFunctions(node.body, (child) => {
    if (child.type === "VariableDeclarator") {
      collectPatternNames(child.id, names);
      return;
    }

    if (
      (child.type === "FunctionDeclaration" || child.type === "ClassDeclaration") &&
      child.id !== null
    ) {
      names.add(child.id.name);
    }
  });

  return names;
}

function collectPatternNames(node: TSESTree.Node, names: Set<string>): void {
  if (node.type === "Identifier") {
    names.add(node.name);
    return;
  }

  if (node.type === "RestElement") {
    collectPatternNames(node.argument, names);
    return;
  }

  if (node.type === "AssignmentPattern") {
    collectPatternNames(node.left, names);
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

  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type === "RestElement") {
        collectPatternNames(property.argument, names);
      } else {
        collectPatternNames(property.value, names);
      }
    }
    return;
  }

  if (node.type === "TSParameterProperty") {
    collectPatternNames(node.parameter, names);
  }
}

function collectConditionIdentifiers(
  node: TSESTree.Node,
): readonly TSESTree.Identifier[] {
  const identifiers: TSESTree.Identifier[] = [];
  collectReferences(node, identifiers);
  return identifiers;
}

function collectReferences(
  node: TSESTree.Node,
  identifiers: TSESTree.Identifier[],
): void {
  if (node.type === "Identifier") {
    identifiers.push(node);
    return;
  }

  if (node.type === "MemberExpression") {
    collectReferences(node.object, identifiers);
    if (node.computed) {
      collectReferences(node.property, identifiers);
    }
    return;
  }

  if (node.type === "Property") {
    if (node.computed) {
      collectReferences(node.key, identifiers);
    }
    collectReferences(node.value, identifiers);
    return;
  }

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      collectReferences(value, identifiers);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          collectReferences(item, identifiers);
        }
      }
    }
  }
}

function namedFunction(node: TSESTree.Node): NamedFunction | undefined {
  if (node.type === "FunctionDeclaration" && node.id !== null) {
    return { name: node.id.name, node };
  }

  if (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression")
  ) {
    return { name: node.id.name, node: node.init };
  }

  return undefined;
}

function collectNamedFunctions(node: TSESTree.Node): readonly NamedFunction[] {
  const functions: NamedFunction[] = [];
  visit(node, (child) => {
    const candidate = namedFunction(child);
    if (candidate !== undefined) {
      functions.push(candidate);
    }
  });
  return functions;
}

function callName(node: TSESTree.CallExpression): string | undefined {
  if (node.callee.type === "Identifier") {
    return node.callee.name;
  }

  return node.callee.type === "MemberExpression"
    ? propertyName(node.callee.property, node.callee.computed)
    : undefined;
}

function propertyName(node: TSESTree.Node, computed: boolean): string | undefined {
  if (!computed && node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
}

function createFinding(
  ruleId: string,
  file: string,
  node: TSESTree.Node,
  title: string,
  message: string,
  suggestion: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [ruleId, file, line, column].join(":"),
    ruleId,
    title,
    message,
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion,
    confidence: 0.99,
  };
}

function isFunctionLike(node: TSESTree.Node): node is FunctionLike {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void {
  visitor(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, visitor);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          visit(item, visitor);
        }
      }
    }
  }
}

function visitWithoutNestedFunctions(
  node: TSESTree.Node,
  visitor: (node: TSESTree.Node) => void,
): void {
  visitor(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      if (!isFunctionLike(value)) {
        visitWithoutNestedFunctions(value, visitor);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item) && !isFunctionLike(item)) {
          visitWithoutNestedFunctions(item, visitor);
        }
      }
    }
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
