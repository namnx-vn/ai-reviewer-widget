import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  getCalleeName,
  getFunctionName,
  getVariableName,
  isFunctionLike,
  isJsxNode,
  isPascalCaseName,
  visit,
} from "../ast/component-utils";

export type ReactComponentKind =
  | "function"
  | "arrow"
  | "memo"
  | "forwardRef";

export interface ComponentLocation {
  readonly line: number;
  readonly column: number;
}

export interface ComponentExportInfo {
  readonly isDefault: boolean;
  readonly isNamed: boolean;
}

export interface ComponentMetadata {
  readonly name: string;
  readonly kind: ReactComponentKind;
  readonly node: TSESTree.Node;
  readonly location: ComponentLocation;
  readonly export: ComponentExportInfo;
  readonly hasJsx: boolean;
}

export interface ComponentAnalysisResult {
  readonly components: readonly ComponentMetadata[];
}

interface ComponentCandidate {
  readonly name: string;
  readonly kind: ReactComponentKind;
  readonly node: TSESTree.Node;
  readonly location: ComponentLocation;
  readonly export: ComponentExportInfo;
}

const EMPTY_EXPORT: ComponentExportInfo = {
  isDefault: false,
  isNamed: false,
};

export function analyzeComponents(
  ast: TSESTree.Program,
): ComponentAnalysisResult {
  const candidates = new Map<
    string,
    ComponentCandidate
  >();

  visit(ast, (node) => {
    collectFunctionComponent(node, candidates);
    collectArrowComponent(node, candidates);
    collectWrappedComponent(node, candidates);
  });

  const components = Array.from(
    candidates.values(),
    (candidate): ComponentMetadata => ({
      ...candidate,
      hasJsx: hasJsxInComponent(candidate.node),
    }),
  ).filter(
    (component) => component.hasJsx,
  );

  return {
    components,
  };
}

function collectFunctionComponent(
  node: TSESTree.Node,
  candidates: Map<string, ComponentCandidate>,
): void {
  if (node.type !== "FunctionDeclaration") {
    return;
  }

  const name = getFunctionName(node);

  if (
    name === undefined ||
    !isPascalCaseName(name)
  ) {
    return;
  }

  addCandidate(
    candidates,
    {
      name,
      kind: "function",
      node,
      location: getLocation(node),
      export: EMPTY_EXPORT,
    },
  );
}

function collectArrowComponent(
  node: TSESTree.Node,
  candidates: Map<string, ComponentCandidate>,
): void {
  if (node.type !== "VariableDeclarator") {
    return;
  }

  const name = getVariableName(node);

  if (
    name === undefined ||
    !isPascalCaseName(name)
  ) {
    return;
  }

  if (
    node.init === null ||
    node.init.type !== "ArrowFunctionExpression"
  ) {
    return;
  }

  addCandidate(
    candidates,
    {
      name,
      kind: "arrow",
      node: node.init,
      location: getLocation(node.init),
      export: EMPTY_EXPORT,
    },
  );
}

function collectWrappedComponent(
  node: TSESTree.Node,
  candidates: Map<string, ComponentCandidate>,
): void {
  if (node.type !== "VariableDeclarator") {
    return;
  }

  const name = getVariableName(node);

  if (
    name === undefined ||
    !isPascalCaseName(name)
  ) {
    return;
  }

  if (
    node.init === null ||
    node.init.type !== "CallExpression"
  ) {
    return;
  }

  const calleeName = getCalleeName(node.init);

  if (
    calleeName !== "memo" &&
    calleeName !== "forwardRef"
  ) {
    return;
  }

  const wrappedComponent = node.init.arguments[0];

  if (
    wrappedComponent === undefined ||
    wrappedComponent.type === "SpreadElement"
  ) {
    return;
  }

  if (
    !isFunctionLike(wrappedComponent)
  ) {
    return;
  }

  addCandidate(
    candidates,
    {
      name,
      kind:
        calleeName === "memo"
          ? "memo"
          : "forwardRef",
      node: wrappedComponent,
      location: getLocation(wrappedComponent),
      export: EMPTY_EXPORT,
    },
  );
}

function hasJsxInComponent(
  node: TSESTree.Node,
): boolean {
  let found = false;

  visit(node, (child) => {
    if (child === node) {
      return;
    }

    if (isJsxNode(child)) {
      found = true;
    }
  });

  return found;
}

function addCandidate(
  candidates: Map<string, ComponentCandidate>,
  candidate: ComponentCandidate,
): void {
  if (candidates.has(candidate.name)) {
    return;
  }

  candidates.set(
    candidate.name,
    candidate,
  );
}

function getLocation(
  node: TSESTree.Node,
): ComponentLocation {
  return {
    line: node.loc?.start.line ?? 1,
    column: node.loc?.start.column ?? 0,
  };
}