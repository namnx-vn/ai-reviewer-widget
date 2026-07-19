import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { CryptoPolicy } from "../../policies/crypto-policy";

export type CryptoObservation =
  | HashObservation
  | CipherObservation
  | HardcodedKeyObservation
  | RandomObservation
  | KdfObservation
  | CustomCryptoObservation;

export interface HashObservation {
  readonly kind: "hash";
  readonly node: TSESTree.CallExpression;
  readonly algorithm?: string;
  readonly contextName?: string;
  readonly passwordContext: boolean;
}

export interface CipherObservation {
  readonly kind: "cipher";
  readonly node: TSESTree.CallExpression;
  readonly algorithm?: string;
  readonly key?: TSESTree.Node;
  readonly iv?: TSESTree.Node;
}

export interface HardcodedKeyObservation {
  readonly kind: "hardcoded-key";
  readonly node: TSESTree.CallExpression;
  readonly key: TSESTree.Node;
  readonly label: string;
}

export interface RandomObservation {
  readonly kind: "random";
  readonly node: TSESTree.CallExpression;
  readonly contextName?: string;
}

export interface KdfObservation {
  readonly kind: "kdf";
  readonly node: TSESTree.CallExpression;
  readonly algorithm: "pbkdf2";
  readonly iterations?: number;
}

export interface CustomCryptoObservation {
  readonly kind: "custom-crypto";
  readonly node: TSESTree.Node;
  readonly name: string;
}

interface ImportedCallable {
  readonly module: string;
  readonly imported: string;
}

interface CryptoModelState {
  readonly namespaces: ReadonlyMap<string, string>;
  readonly callables: ReadonlyMap<string, ImportedCallable>;
  readonly webCryptoRoots: ReadonlySet<string>;
}

const NODE_CRYPTO_MODULES = new Set(["crypto", "node:crypto"]);
const CIPHER_CALLS = new Set([
  "createCipher",
  "createCipheriv",
  "createDecipher",
  "createDecipheriv",
]);
const BITWISE_OPERATORS = new Set(["&", "|", "^", "<<", ">>", ">>>"]);

export function collectCryptoObservations(
  ast: TSESTree.Program,
  policy: CryptoPolicy,
): readonly CryptoObservation[] {
  const state = buildModelState(ast);
  const observations: CryptoObservation[] = [];

  visit(ast, [], (node, ancestors) => {
    if (node.type === "CallExpression") {
      collectCallObservations(node, ancestors, state, policy, observations);
    }

    if (isFunctionNode(node)) {
      const name = functionName(node, ancestors);
      if (
        name !== undefined &&
        policy.customCryptoNamePattern.test(name) &&
        containsBitwiseOperation(node) &&
        !containsKnownCryptoCall(node, state)
      ) {
        observations.push({ kind: "custom-crypto", node, name });
      }
    }
  });

  return observations.sort((left, right) => (
    (left.node.range?.[0] ?? Number.MAX_SAFE_INTEGER) -
    (right.node.range?.[0] ?? Number.MAX_SAFE_INTEGER)
  ));
}

function collectCallObservations(
  node: TSESTree.CallExpression,
  ancestors: readonly TSESTree.Node[],
  state: CryptoModelState,
  policy: CryptoPolicy,
  output: CryptoObservation[],
): void {
  const identity = callableIdentity(node.callee, state);
  const path = memberPath(node.callee);
  const contextName = nearestContextName(ancestors);

  if (isNodeCryptoCallable(identity, path, state, "createHash")) {
    output.push({
      kind: "hash",
      node,
      algorithm: stringArgument(node, 0),
      contextName,
      passwordContext: contextName !== undefined && policy.passwordNamePattern.test(contextName),
    });
  }

  const cipherMethod = nodeCryptoMethod(identity, path, state, CIPHER_CALLS);
  if (cipherMethod !== undefined) {
    output.push({
      kind: "cipher",
      node,
      algorithm: stringArgument(node, 0),
      key: cipherMethod.endsWith("iv") ? expressionArgument(node, 1) : undefined,
      iv: cipherMethod.endsWith("iv") ? expressionArgument(node, 2) : undefined,
    });
  }

  if (isNodeCryptoCallable(identity, path, state, "createSecretKey")) {
    const key = expressionArgument(node, 0);
    if (key !== undefined && isHardcodedMaterial(key)) {
      output.push({ kind: "hardcoded-key", node, key, label: "Hardcoded secret key material" });
    }
  }

  if (
    isNodeCryptoCallable(identity, path, state, "pbkdf2") ||
    isNodeCryptoCallable(identity, path, state, "pbkdf2Sync")
  ) {
    output.push({
      kind: "kdf",
      node,
      algorithm: "pbkdf2",
      iterations: numericArgument(node, 2),
    });
  }

  if (isMathRandom(node)) {
    output.push({ kind: "random", node, contextName });
  }

  const webCryptoMethod = webCryptoMethodName(path, state);
  if (webCryptoMethod === "digest") {
    output.push({
      kind: "hash",
      node,
      algorithm: algorithmName(expressionArgument(node, 0)),
      contextName,
      passwordContext: contextName !== undefined && policy.passwordNamePattern.test(contextName),
    });
  }

  if (webCryptoMethod === "encrypt" || webCryptoMethod === "decrypt") {
    const algorithm = expressionArgument(node, 0);
    output.push({
      kind: "cipher",
      node,
      algorithm: algorithmName(algorithm),
      key: expressionArgument(node, 1),
      iv: objectPropertyValue(algorithm, "iv"),
    });
  }

  if (webCryptoMethod === "importKey") {
    const key = expressionArgument(node, 1);
    if (key !== undefined && isHardcodedMaterial(key)) {
      output.push({ kind: "hardcoded-key", node, key, label: "Hardcoded imported cryptographic key" });
    }
  }

  if (webCryptoMethod === "deriveBits" || webCryptoMethod === "deriveKey") {
    const parameters = expressionArgument(node, 0);
    const name = algorithmName(parameters)?.toLowerCase();
    if (name === "pbkdf2") {
      output.push({
        kind: "kdf",
        node,
        algorithm: "pbkdf2",
        iterations: numericNodeValue(objectPropertyValue(parameters, "iterations")),
      });
    }
  }

  if (cipherMethod?.endsWith("iv")) {
    const key = expressionArgument(node, 1);
    if (key !== undefined && isHardcodedMaterial(key)) {
      output.push({ kind: "hardcoded-key", node, key, label: "Hardcoded cipher key material" });
    }
  }
}

function buildModelState(ast: TSESTree.Program): CryptoModelState {
  const namespaces = new Map<string, string>();
  const callables = new Map<string, ImportedCallable>();
  const webCryptoRoots = new Set<string>();

  visit(ast, [], (node) => {
    if (node.type === "ImportDeclaration") {
      const module = stringLiteralValue(node.source);
      if (module === undefined || !NODE_CRYPTO_MODULES.has(module)) {
        return;
      }

      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") {
          namespaces.set(specifier.local.name, module);
          continue;
        }

        const imported = nodeName(specifier.imported);
        if (imported === undefined) {
          continue;
        }
        callables.set(specifier.local.name, { module, imported });
        if (imported === "webcrypto") {
          webCryptoRoots.add(specifier.local.name);
        }
      }
      return;
    }

    if (node.type !== "VariableDeclarator" || node.init === null) {
      return;
    }

    const required = requireModule(node.init);
    if (required !== undefined && NODE_CRYPTO_MODULES.has(required)) {
      if (node.id.type === "Identifier") {
        namespaces.set(node.id.name, required);
        return;
      }
      if (node.id.type === "ObjectPattern") {
        for (const property of node.id.properties) {
          if (property.type === "RestElement" || property.value.type !== "Identifier") {
            continue;
          }
          const imported = propertyName(property.key, property.computed);
          if (imported === undefined) {
            continue;
          }
          callables.set(property.value.name, { module: required, imported });
          if (imported === "webcrypto") {
            webCryptoRoots.add(property.value.name);
          }
        }
      }
      return;
    }

    if (node.id.type !== "Identifier") {
      return;
    }

    const identity = callableIdentity(node.init, { namespaces, callables, webCryptoRoots });
    if (identity !== undefined) {
      callables.set(node.id.name, identity);
    }
  });

  return { namespaces, callables, webCryptoRoots };
}

function callableIdentity(
  node: TSESTree.Node,
  state: CryptoModelState,
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
  const root = path[0];
  const imported = path[path.length - 1];
  if (root === undefined || imported === undefined) {
    return undefined;
  }
  const module = state.namespaces.get(root);
  return module === undefined ? undefined : { module, imported };
}

function isNodeCryptoCallable(
  identity: ImportedCallable | undefined,
  path: readonly string[] | undefined,
  state: CryptoModelState,
  method: string,
): boolean {
  if (identity !== undefined && NODE_CRYPTO_MODULES.has(identity.module)) {
    return identity.imported === method;
  }
  return nodeCryptoMethod(identity, path, state, new Set([method])) !== undefined;
}

function nodeCryptoMethod(
  identity: ImportedCallable | undefined,
  path: readonly string[] | undefined,
  state: CryptoModelState,
  allowed: ReadonlySet<string>,
): string | undefined {
  if (
    identity !== undefined &&
    NODE_CRYPTO_MODULES.has(identity.module) &&
    allowed.has(identity.imported)
  ) {
    return identity.imported;
  }
  if (path === undefined || path.length < 2) {
    return undefined;
  }
  const root = path[0];
  const method = path[path.length - 1];
  if (root === undefined || method === undefined || !allowed.has(method)) {
    return undefined;
  }
  return state.namespaces.has(root) ? method : undefined;
}

function webCryptoMethodName(
  path: readonly string[] | undefined,
  state: CryptoModelState,
): string | undefined {
  if (path === undefined || path.length < 2) {
    return undefined;
  }
  const method = path[path.length - 1];
  if (method === undefined) {
    return undefined;
  }

  if (
    path.length >= 3 &&
    path[path.length - 2] === "subtle" &&
    (
      path[0] === "crypto" ||
      path[0] === "window" ||
      path[0] === "globalThis" ||
      (path[0] !== undefined && state.webCryptoRoots.has(path[0])) ||
      (path[0] !== undefined && state.namespaces.has(path[0]) && path.includes("webcrypto"))
    )
  ) {
    return method;
  }
  return undefined;
}

function isMathRandom(node: TSESTree.CallExpression): boolean {
  const path = memberPath(node.callee);
  return path?.length === 2 && path[0] === "Math" && path[1] === "random";
}

function nearestContextName(ancestors: readonly TSESTree.Node[]): string | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor?.type === "VariableDeclarator" && ancestor.id.type === "Identifier") {
      return ancestor.id.name;
    }
    if (ancestor?.type === "AssignmentExpression") {
      return assignmentTargetName(ancestor.left);
    }
    if (ancestor !== undefined && isFunctionNode(ancestor)) {
      const name = functionNodeName(ancestor);
      if (name !== undefined) {
        return name;
      }
    }
  }
  return undefined;
}

function assignmentTargetName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }
  const path = memberPath(node);
  return path?.[path.length - 1];
}

function functionName(
  node: TSESTree.Node,
  ancestors: readonly TSESTree.Node[],
): string | undefined {
  const direct = functionNodeName(node);
  if (direct !== undefined) {
    return direct;
  }
  const parent = ancestors[ancestors.length - 1];
  return parent?.type === "VariableDeclarator" && parent.id.type === "Identifier"
    ? parent.id.name
    : undefined;
}

function functionNodeName(node: TSESTree.Node): string | undefined {
  if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
    return node.id?.name;
  }
  return undefined;
}

function isFunctionNode(node: TSESTree.Node): boolean {
  return node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression";
}

function containsBitwiseOperation(node: TSESTree.Node): boolean {
  let found = false;
  visit(node, [], (candidate) => {
    if (
      candidate.type === "BinaryExpression" &&
      BITWISE_OPERATORS.has(candidate.operator)
    ) {
      found = true;
    }
  });
  return found;
}

function containsKnownCryptoCall(
  node: TSESTree.Node,
  state: CryptoModelState,
): boolean {
  let found = false;
  visit(node, [], (candidate) => {
    if (candidate.type !== "CallExpression") {
      return;
    }
    const identity = callableIdentity(candidate.callee, state);
    const path = memberPath(candidate.callee);
    if (
      (identity !== undefined && NODE_CRYPTO_MODULES.has(identity.module)) ||
      (path?.[0] !== undefined && state.namespaces.has(path[0])) ||
      webCryptoMethodName(path, state) !== undefined
    ) {
      found = true;
    }
  });
  return found;
}

export function isHardcodedMaterial(node: TSESTree.Node): boolean {
  const expression = unwrapChain(node);
  if (stringLiteralValue(expression) !== undefined) {
    return true;
  }
  if (expression.type === "TemplateLiteral") {
    return expression.expressions.length === 0;
  }
  if (expression.type === "ArrayExpression") {
    return expression.elements.length > 0 && expression.elements.every((element) => (
      element !== null && element.type === "Literal"
    ));
  }
  if (expression.type === "NewExpression") {
    const path = memberPath(expression.callee);
    if (path?.[path.length - 1] === "Uint8Array") {
      const first = expression.arguments[0];
      return first !== undefined && first.type !== "SpreadElement" && isHardcodedMaterial(first);
    }
  }
  if (expression.type === "CallExpression") {
    const path = memberPath(expression.callee);
    const first = expression.arguments[0];
    if (
      (path?.join(".") === "Buffer.from" || path?.join(".") === "Buffer.alloc") &&
      first !== undefined &&
      first.type !== "SpreadElement"
    ) {
      return first.type === "Literal";
    }
  }
  return false;
}

function algorithmName(node: TSESTree.Node | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  return stringLiteralValue(node) ?? stringLiteralValue(objectPropertyValue(node, "name"));
}

function objectPropertyValue(
  node: TSESTree.Node | undefined,
  expected: string,
): TSESTree.Node | undefined {
  if (node?.type !== "ObjectExpression") {
    return undefined;
  }
  for (const property of node.properties) {
    if (
      property.type !== "SpreadElement" &&
      propertyName(property.key, property.computed) === expected
    ) {
      return property.value;
    }
  }
  return undefined;
}

function expressionArgument(
  node: TSESTree.CallExpression,
  index: number,
): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement" ? undefined : argument;
}

function stringArgument(node: TSESTree.CallExpression, index: number): string | undefined {
  const argument = expressionArgument(node, index);
  return argument === undefined ? undefined : stringLiteralValue(argument);
}

function numericArgument(node: TSESTree.CallExpression, index: number): number | undefined {
  return numericNodeValue(expressionArgument(node, index));
}

function numericNodeValue(node: TSESTree.Node | undefined): number | undefined {
  return node?.type === "Literal" && typeof node.value === "number" ? node.value : undefined;
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
  return first === undefined || first.type === "SpreadElement" ? undefined : stringLiteralValue(first);
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
  return object === undefined || property === undefined ? undefined : [...object, property];
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

function stringLiteralValue(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function unwrapChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === "ChainExpression" ? node.expression : node;
}

function visit(
  node: TSESTree.Node,
  ancestors: readonly TSESTree.Node[],
  visitor: (node: TSESTree.Node, ancestors: readonly TSESTree.Node[]) => void,
): void {
  visitor(node, ancestors);
  for (const child of getChildNodes(node)) {
    visit(child, [...ancestors, node], visitor);
  }
}

function getChildNodes(node: TSESTree.Node): readonly TSESTree.Node[] {
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
  return children.sort((left, right) => (
    (left.range?.[0] ?? Number.MAX_SAFE_INTEGER) -
    (right.range?.[0] ?? Number.MAX_SAFE_INTEGER)
  ));
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}
