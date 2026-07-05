import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type {
  ScopeKind,
  SourceLocation,
  ScopeAnalysisResult,
} from "./scope-types";

export interface MutableScope {
  readonly id: number;
  readonly kind: ScopeKind;
  readonly node: TSESTree.Node;
  readonly parentId?: number;
  readonly declarations: DeclarationInput[];
  readonly references: ReferenceInput[];
  readonly children: MutableScope[];
}

export interface DeclarationInput {
  readonly name: string;
  readonly kind:
    | "const"
    | "let"
    | "var"
    | "function"
    | "class"
    | "parameter"
    | "import"
    | "catch";
  readonly node: TSESTree.Node;
  readonly location: SourceLocation;
  readonly scopeId: number;
}

export interface ReferenceInput {
  readonly name: string;
  readonly node: TSESTree.Identifier;
  readonly location: SourceLocation;
  readonly isWrite: boolean;
}

export interface ScopeBuildState {
  readonly scopes: MutableScope[];
  readonly scopeByNode: Map<TSESTree.Node, MutableScope>;
  nextScopeId: number;
}

export function getLocation(node: TSESTree.Node): SourceLocation {
  return {
    line: node.loc?.start.line ?? 1,
    column: node.loc?.start.column ?? 0,
  };
}

export function isNode(value: unknown): value is TSESTree.Node {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("type" in value)) {
    return false;
  }

  return typeof value.type === "string";
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

export function createScope(
  state: ScopeBuildState,
  kind: ScopeKind,
  node: TSESTree.Node,
  parent?: MutableScope,
): MutableScope {
  const scope: MutableScope = {
    id: state.nextScopeId,
    kind,
    node,
    parentId: parent?.id,
    declarations: [],
    references: [],
    children: [],
  };

  state.nextScopeId += 1;

  state.scopes.push(scope);
  state.scopeByNode.set(node, scope);

  if (parent !== undefined) {
    parent.children.push(scope);
  }

  return scope;
}

export interface ScopeBuildResult {
  readonly rootScope: MutableScope;
  readonly scopes: readonly MutableScope[];
  readonly scopeByNode: ReadonlyMap<TSESTree.Node, MutableScope>;
}

export function findScopeForNode(
  node: TSESTree.Node,
  currentScope: MutableScope,
  scopeBuild: ScopeBuildResult,
): MutableScope {
  return scopeBuild.scopeByNode.get(node) ?? currentScope;
}

export function findFunctionScope(
  scope: MutableScope,
  rootScope: MutableScope,
): MutableScope {
  let current: MutableScope | undefined = scope;

  while (current !== undefined) {
    if (current.kind === "function" || current.kind === "program") {
      return current;
    }

    current = findParentScope(current, rootScope);
  }

  return rootScope;
}

function findParentScope(
  scope: MutableScope,
  rootScope: MutableScope,
): MutableScope | undefined {
  if (scope.parentId === undefined) {
    return undefined;
  }

  return findScopeById(rootScope, scope.parentId);
}

function findScopeById(
  scope: MutableScope,
  id: number,
): MutableScope | undefined {
  if (scope.id === id) {
    return scope;
  }

  for (const child of scope.children) {
    const found = findScopeById(child, id);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
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

export function isFunctionBody(node: TSESTree.Node): boolean {
  return node.type === "BlockStatement" && node.parent === undefined;
}

export function containsNode(
  container: TSESTree.Node,
  target: TSESTree.Node,
): boolean {
  const containerStart = container.loc?.start;

  const containerEnd = container.loc?.end;

  const targetStart = target.loc?.start;

  const targetEnd = target.loc?.end;

  if (
    containerStart === undefined ||
    containerEnd === undefined ||
    targetStart === undefined ||
    targetEnd === undefined
  ) {
    return false;
  }

  if (
    targetStart.line < containerStart.line ||
    targetEnd.line > containerEnd.line
  ) {
    return false;
  }

  if (
    targetStart.line === containerStart.line &&
    targetStart.column < containerStart.column
  ) {
    return false;
  }

  if (
    targetEnd.line === containerEnd.line &&
    targetEnd.column > containerEnd.column
  ) {
    return false;
  }

  return true;
}

export function scopeDepth(scope: MutableScope): number {
  let depth = 0;
  let current = scope.parent;

  while (current !== undefined) {
    depth += 1;
    current = current.parent;
  }

  return depth;
}

export function findInnermostScope(
  root: MutableScope,
  node: TSESTree.Node,
): MutableScope {
  let result = root;

  for (const child of root.children) {
    if (!containsNode(child.node, node)) {
      continue;
    }

    const nested = findInnermostScope(child, node);

    if (scopeDepth(nested) > scopeDepth(result)) {
      result = nested;
    }
  }

  return result;
}

export function findNearestFunctionScope(scope: MutableScope): MutableScope {
  let current: MutableScope | undefined = scope;

  while (current !== undefined) {
    if (current.kind === "function" || current.kind === "program") {
      return current;
    }

    current = current.parent;
  }

  return scope;
}

export function isReferenceIdentifier(node: TSESTree.Identifier): boolean {
  const parent = node.parent;

  if (parent === undefined) {
    return true;
  }

  if (
    parent.type === "MemberExpression" &&
    parent.property === node &&
    !parent.computed
  ) {
    return false;
  }

  if (
    parent.type === "OptionalMemberExpression" &&
    parent.property === node &&
    !parent.computed
  ) {
    return false;
  }

  if (
    parent.type === "Property" &&
    parent.key === node &&
    !parent.computed &&
    parent.value !== node
  ) {
    return false;
  }

  if (
    parent.type === "MethodDefinition" &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }

  if (
    parent.type === "PropertyDefinition" &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }

  if (parent.type === "LabeledStatement" && parent.label === node) {
    return false;
  }

  if (parent.type === "BreakStatement" && parent.label === node) {
    return false;
  }

  if (parent.type === "ContinueStatement" && parent.label === node) {
    return false;
  }

  return true;
}

export function getScopeById(result: ScopeAnalysisResult, id: number) {
  return result.scopes.find((scope) => scope.id === id);
}
