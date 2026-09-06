import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../engine/finding-id";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
  SecuritySinkKind,
} from "../model/types";

type RuntimeBoundaryKind =
  | "operational-response"
  | "csp-nonce"
  | "script-json"
  | "env-reload";

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

interface Match {
  readonly kind: RuntimeBoundaryKind;
  readonly node: TSESTree.Node;
}

interface RuleDetail {
  readonly meta: SecurityRuleMeta;
  readonly message: string;
  readonly suggestion: string;
  readonly sinkKind?: SecuritySinkKind;
}

const DETAILS: Readonly<Record<RuntimeBoundaryKind, RuleDetail>> = {
  "operational-response": {
    meta: {
      id: "security.data.operational-response-exposure",
      title: "Operational health details exposed in a response",
      description:
        "Detects health-check responses that directly serialize process memory, uptime, and related operational details.",
      category: "data",
      defaultSeverity: "medium",
      defaultConfidence: "high",
      standards: [{ standard: "cwe", id: "CWE-200" }],
    },
    message:
      "A public response directly serializes a health-check result that contains process-level operational details such as memory usage and uptime.",
    suggestion:
      "Return a minimal public health status and keep process metrics, service diagnostics, and raw error details behind an authenticated diagnostics surface.",
    sinkKind: "secret-output",
  },
  "csp-nonce": {
    meta: {
      id: "security.xss.csp-nonce-propagation",
      title: "CSP nonce is not propagated to executable output",
      description:
        "Detects script descriptors and render calls that receive a nonce-capable context but omit the nonce from executable output.",
      category: "xss",
      defaultSeverity: "medium",
      defaultConfidence: "high",
      standards: [{ standard: "cwe", id: "CWE-693" }],
    },
    message:
      "This render path receives a CSP nonce-capable context but constructs executable script output without forwarding the nonce.",
    suggestion:
      "Thread the request nonce through the script descriptor or renderer stream options so strict nonce-based CSP remains effective.",
    sinkKind: "html-render",
  },
  "script-json": {
    meta: {
      id: "security.xss.raw-json-script-serialization",
      title: "Raw JSON embedded in a script element",
      description:
        "Detects direct JSON.stringify interpolation inside script elements where serialized data can terminate the script context.",
      category: "xss",
      defaultSeverity: "high",
      defaultConfidence: "high",
      standards: [{ standard: "cwe", id: "CWE-79" }],
    },
    message:
      "JSON.stringify output is interpolated directly into a script element without an HTML-safe serialization step.",
    suggestion:
      "Use a serializer that escapes script-breaking characters such as '<', or transport the state through a non-executable data channel.",
    sinkKind: "html-render",
  },
  "env-reload": {
    meta: {
      id: "security.configuration.destructive-env-reload",
      title: "Environment state is replaced before reload succeeds",
      description:
        "Detects environment reload helpers that reset process state before replacement dotenv content has been read successfully.",
      category: "configuration",
      defaultSeverity: "medium",
      defaultConfidence: "high",
    },
    message:
      "The reload path replaces existing process environment state before the replacement dotenv read has produced content.",
    suggestion:
      "Read and validate replacement environment data first, then replace process state only after the reload has succeeded.",
  },
};

export const runtimeBoundarySecurityRules: readonly SecurityRule[] = [
  createRule("operational-response"),
  createRule("csp-nonce"),
  createRule("script-json"),
  createRule("env-reload"),
];

function createRule(kind: RuntimeBoundaryKind): SecurityRule {
  const detail = DETAILS[kind];

  return {
    meta: detail.meta,
    check(context) {
      return findMatches(context, kind).map((match) =>
        createFinding(context, detail, match),
      );
    },
  };
}

function findMatches(
  context: SecurityRuleContext,
  kind: RuntimeBoundaryKind,
): readonly Match[] {
  if (kind === "operational-response") {
    return findOperationalResponseExposure(context.ast);
  }

  if (kind === "csp-nonce") {
    return findCspNonceOmissions(context.ast);
  }

  if (kind === "script-json") {
    return findRawJsonScriptSerialization(context.ast);
  }

  return findDestructiveEnvReload(context.ast);
}

function findOperationalResponseExposure(
  ast: TSESTree.Program,
): readonly Match[] {
  if (!hasOperationalHealthShape(ast)) {
    return [];
  }

  const healthBindings = new Set<string>();
  const matches: Match[] = [];

  visit(ast, (node) => {
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init !== null &&
      isHealthCheckExpression(node.init)
    ) {
      healthBindings.add(node.id.name);
    }
  });

  visit(ast, (node) => {
    if (node.type !== "CallExpression" || !isResponseSerializer(node)) {
      return;
    }

    const body = node.arguments[0];
    if (body === undefined || body.type === "SpreadElement") {
      return;
    }

    if (
      (body.type === "Identifier" && healthBindings.has(body.name)) ||
      (body.type === "ObjectExpression" && objectContainsOperationalDetails(body))
    ) {
      matches.push({ kind: "operational-response", node });
    }
  });

  return matches;
}

function hasOperationalHealthShape(ast: TSESTree.Program): boolean {
  let found = false;

  visit(ast, (node) => {
    if (found) {
      return;
    }

    if (node.type === "TSInterfaceDeclaration") {
      const names = collectPropertyNames(node.body);
      found = names.has("memoryUsage") && names.has("uptime");
      return;
    }

    if (node.type === "TSTypeAliasDeclaration") {
      const names = collectPropertyNames(node.typeAnnotation);
      found = names.has("memoryUsage") && names.has("uptime");
    }
  });

  return found;
}

function isHealthCheckExpression(node: TSESTree.Node): boolean {
  const expression = node.type === "AwaitExpression" ? node.argument : node;
  if (expression.type !== "CallExpression") {
    return false;
  }

  return /^(?:check|healthCheck|checkHealth|probe)$/i.test(
    leafName(calleeName(expression.callee)),
  );
}

function isResponseSerializer(node: TSESTree.CallExpression): boolean {
  const name = calleeName(node.callee);
  return (
    name === "NextResponse.json" ||
    name === "Response.json" ||
    /^(?:res|reply|response)\.(?:json|send)$/.test(name)
  );
}

function objectContainsOperationalDetails(node: TSESTree.ObjectExpression): boolean {
  const names = collectPropertyNames(node);
  return names.has("memoryUsage") && names.has("uptime");
}

function findRawJsonScriptSerialization(
  ast: TSESTree.Program,
): readonly Match[] {
  const matches: Match[] = [];

  visit(ast, (node) => {
    if (node.type !== "TemplateLiteral") {
      return;
    }

    const templateText = node.quasis.map((quasi) => quasi.value.raw).join("");
    if (!/<script\b/i.test(templateText) || !/<\/script>/i.test(templateText)) {
      return;
    }

    if (node.expressions.some((expression) => isDirectJsonStringify(expression))) {
      matches.push({ kind: "script-json", node });
    }
  });

  return matches;
}

function isDirectJsonStringify(node: TSESTree.Node): boolean {
  return node.type === "CallExpression" && calleeName(node.callee) === "JSON.stringify";
}

function findCspNonceOmissions(ast: TSESTree.Program): readonly Match[] {
  const nonceTypes = collectNamedTypesContainingProperty(ast, "nonce");
  const matches: Match[] = [];

  visitNamedFunctions(ast, (name, node) => {
    if (!node.params.some((parameter) => parameterCarriesProperty(parameter, "nonce", nonceTypes))) {
      return;
    }

    if (node.body.type !== "BlockStatement") {
      return;
    }

    visit(node.body, (child) => {
      if (
        child.type === "ReturnStatement" &&
        child.argument?.type === "ObjectExpression" &&
        /(script|segment|boundary)/i.test(name) &&
        isScriptDescriptor(child.argument) &&
        !objectContainsProperty(child.argument, "nonce")
      ) {
        matches.push({ kind: "csp-nonce", node: child.argument });
        return;
      }

      if (
        child.type === "CallExpression" &&
        /(render|page|router)/i.test(name) &&
        isRenderCallMissingNonce(child)
      ) {
        matches.push({ kind: "csp-nonce", node: child });
      }
    });
  });

  return deduplicateMatches(matches);
}

function isScriptDescriptor(node: TSESTree.ObjectExpression): boolean {
  const names = directPropertyNames(node);
  return (
    names.has("src") &&
    (names.has("async") || names.has("defer") || names.has("key"))
  );
}

function isRenderCallMissingNonce(node: TSESTree.CallExpression): boolean {
  const name = calleeName(node.callee);
  if (!/(render|fizz|stream)/i.test(name)) {
    return false;
  }

  const options = node.arguments[0];
  if (options?.type !== "ObjectExpression") {
    return false;
  }

  const names = directPropertyNames(options);
  if (!names.has("element") && !names.has("streamOptions")) {
    return false;
  }

  return !objectContainsProperty(options, "nonce");
}

function findDestructiveEnvReload(ast: TSESTree.Program): readonly Match[] {
  const matches: Match[] = [];

  visitNamedFunctions(ast, (name, node) => {
    if (!/env/i.test(name) || !/(?:reload|load)/i.test(name)) {
      return;
    }

    if (node.body.type !== "BlockStatement") {
      return;
    }

    const destructiveCalls: Array<{
      readonly index: number;
      readonly node: TSESTree.CallExpression;
    }> = [];
    const loadCalls: Array<{
      readonly index: number;
      readonly node: TSESTree.CallExpression;
    }> = [];

    node.body.body.forEach((statement, index) => {
      visit(statement, (child) => {
        if (child.type !== "CallExpression") {
          return;
        }

        if (isDestructiveEnvCall(child)) {
          destructiveCalls.push({ index, node: child });
        }

        if (isEnvLoadCall(child)) {
          loadCalls.push({ index, node: child });
        }
      });
    });

    const destructive = destructiveCalls.find((candidate) =>
      loadCalls.some((load) => load.index > candidate.index),
    );

    if (destructive !== undefined) {
      matches.push({ kind: "env-reload", node: destructive.node });
    }
  });

  return matches;
}

function isDestructiveEnvCall(node: TSESTree.CallExpression): boolean {
  const leaf = leafName(calleeName(node.callee));
  return /(?:replace|reset|clear).*(?:env)|(?:env).*(?:replace|reset|clear)/i.test(leaf);
}

function isEnvLoadCall(node: TSESTree.CallExpression): boolean {
  const leaf = leafName(calleeName(node.callee));
  return /(?:read|load|reload).*(?:env)|(?:env).*(?:read|load|reload)/i.test(leaf);
}

function visitNamedFunctions(
  ast: TSESTree.Program,
  callback: (name: string, node: FunctionLike) => void,
): void {
  visit(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id !== null) {
      callback(node.id.name, node);
      return;
    }

    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression")
    ) {
      callback(node.id.name, node.init);
    }
  });
}

function collectNamedTypesContainingProperty(
  ast: TSESTree.Program,
  propertyName: string,
): ReadonlySet<string> {
  const namedTypes = new Set<string>();
  const declarations: Array<{
    readonly name: string;
    readonly node: TSESTree.Node;
  }> = [];

  visit(ast, (node) => {
    if (node.type === "TSInterfaceDeclaration") {
      declarations.push({ name: node.id.name, node: node.body });
      return;
    }

    if (node.type === "TSTypeAliasDeclaration") {
      declarations.push({ name: node.id.name, node: node.typeAnnotation });
    }
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (
        !namedTypes.has(declaration.name) &&
        typeContainsProperty(declaration.node, propertyName, namedTypes)
      ) {
        namedTypes.add(declaration.name);
        changed = true;
      }
    }
  }

  return namedTypes;
}

function parameterCarriesProperty(
  parameter: TSESTree.Node,
  propertyName: string,
  namedTypes: ReadonlySet<string>,
): boolean {
  const typeNode = parameterTypeNode(parameter);
  return typeNode !== undefined && typeContainsProperty(typeNode, propertyName, namedTypes);
}

function parameterTypeNode(parameter: TSESTree.Node): TSESTree.Node | undefined {
  if (
    parameter.type === "Identifier" ||
    parameter.type === "ArrayPattern" ||
    parameter.type === "ObjectPattern"
  ) {
    return parameter.typeAnnotation?.typeAnnotation;
  }

  if (parameter.type === "RestElement") {
    return parameterTypeNode(parameter.argument);
  }

  if (parameter.type === "AssignmentPattern") {
    return parameterTypeNode(parameter.left);
  }

  if (parameter.type === "TSParameterProperty") {
    return parameterTypeNode(parameter.parameter);
  }

  return undefined;
}

function typeContainsProperty(
  node: TSESTree.Node,
  propertyName: string,
  namedTypes: ReadonlySet<string>,
): boolean {
  let found = false;

  visit(node, (child) => {
    if (found) {
      return;
    }

    if (
      child.type === "TSPropertySignature" &&
      !child.computed &&
      propertyKeyName(child.key) === propertyName
    ) {
      found = true;
      return;
    }

    if (
      child.type === "TSTypeReference" &&
      child.typeName.type === "Identifier" &&
      namedTypes.has(child.typeName.name)
    ) {
      found = true;
    }
  });

  return found;
}

function collectPropertyNames(node: TSESTree.Node): ReadonlySet<string> {
  const names = new Set<string>();

  visit(node, (child) => {
    if (child.type !== "TSPropertySignature" && child.type !== "Property") {
      return;
    }

    if (child.computed) {
      return;
    }

    const name = propertyKeyName(child.key);
    if (name !== undefined) {
      names.add(name);
    }
  });

  return names;
}

function directPropertyNames(node: TSESTree.ObjectExpression): ReadonlySet<string> {
  const names = new Set<string>();

  for (const property of node.properties) {
    if (property.type !== "Property" || property.computed) {
      continue;
    }

    const name = propertyKeyName(property.key);
    if (name !== undefined) {
      names.add(name);
    }
  }

  return names;
}

function objectContainsProperty(
  node: TSESTree.ObjectExpression,
  propertyName: string,
): boolean {
  let found = false;

  visit(node, (child) => {
    if (
      child.type === "Property" &&
      !child.computed &&
      propertyKeyName(child.key) === propertyName
    ) {
      found = true;
    }
  });

  return found;
}

function propertyKeyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
}

function calleeName(node: TSESTree.Node): string {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
  ) {
    const objectName = calleeName(node.object);
    return objectName.length === 0
      ? node.property.name
      : `${objectName}.${node.property.name}`;
  }

  return "";
}

function leafName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1] ?? "";
}

function deduplicateMatches(matches: readonly Match[]): readonly Match[] {
  const identities = new Set<string>();
  const result: Match[] = [];

  for (const match of matches) {
    const identity = `${match.kind}:${match.node.range?.[0] ?? -1}:${match.node.range?.[1] ?? -1}`;
    if (identities.has(identity)) {
      continue;
    }

    identities.add(identity);
    result.push(match);
  }

  return result;
}

function createFinding(
  context: SecurityRuleContext,
  detail: RuleDetail,
  match: Match,
): SecurityFinding {
  const range = match.node.range === undefined
    ? undefined
    : { start: match.node.range[0], end: match.node.range[1] };
  const location = {
    path: context.file,
    line: match.node.loc?.start.line,
    column: match.node.loc?.start.column,
    range,
  };

  return {
    id: createSecurityFindingId({
      ruleId: detail.meta.id,
      path: context.file,
      range,
      sinkKind: detail.sinkKind,
    }),
    ruleId: detail.meta.id,
    title: detail.meta.title,
    message: detail.message,
    severity: detail.meta.defaultSeverity,
    confidence: detail.meta.defaultConfidence,
    category: detail.meta.category,
    location,
    evidence: [{
      message: detail.meta.description,
      location,
      sinkKind: detail.sinkKind,
    }],
    standards: detail.meta.standards,
    sinkKind: detail.sinkKind,
    suggestion: detail.suggestion,
  };
}

function visit(
  node: TSESTree.Node,
  visitor: (node: TSESTree.Node) => void,
): void {
  visitor(node);

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, visitor);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        visit(item, visitor);
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
