import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { analyzeDeclarations } from "./declaration-analyzer";
import { analyzeReferences } from "./reference-analyzer";
import { buildScopes } from "./scope-builder";
import { getScopeById } from "./scope-utils";
import type {
  IdentifierResolution,
  Scope,
  ScopeAnalysisResult,
  Declaration,
  Reference,
} from "./scope-types";

export function analyzeScopes(ast: TSESTree.Program): ScopeAnalysisResult {
  const scopeBuild = buildScopes(ast);

  const { declarations, declarationNodes } = analyzeDeclarations(
    ast,
    scopeBuild.rootScope,
  );

  const { references } = analyzeReferences(
    ast,
    scopeBuild,
    declarations,
    declarationNodes,
  );

  const scopes = materializeScopes(
    scopeBuild.rootScope,
    declarations,
    references,
  );

  const rootScope = scopes.find(
    (scope) => scope.id === scopeBuild.rootScope.id,
  );

  if (rootScope === undefined) {
    throw new Error("Scope analysis failed to materialize the root scope.");
  }

  return {
    rootScope,
    scopes,
    declarations: attachScopeIds(declarations),
    references,
  };
}

export function resolveIdentifier(
  result: ScopeAnalysisResult,
  scopeId: number,
  name: string,
): IdentifierResolution {
  let scope = getScopeById(result, scopeId);

  while (scope !== undefined) {
    const declaration = scope.declarations.find(
      (candidate) => candidate.name === name,
    );

    if (declaration !== undefined) {
      return {
        name,
        declaration,
        scope,
      };
    }

    if (scope.parentId === undefined) {
      break;
    }

    scope = getScopeById(result, scope.parentId);
  }

  return {
    name,
  };
}

function materializeScopes(
  root: ScopeBuilderNode,
  declarations: readonly Declaration[],
  references: readonly Reference[],
): Scope[] {
  const declarationMap = new Map<number, Declaration[]>();

  for (const declaration of declarations) {
    const current = declarationMap.get(declaration.scopeId);

    const materialized: Declaration = {
      name: declaration.name,
      kind: declaration.kind,
      node: declaration.node,
      location: declaration.location,
      scopeId: declaration.scopeId,
    };

    if (current === undefined) {
      declarationMap.set(declaration.scopeId, [materialized]);
    } else {
      current.push(materialized);
    }
  }

  const referenceMap = new Map<number, Reference[]>();

  for (const reference of references) {
    const current = referenceMap.get(reference.scopeId);

    if (current === undefined) {
      referenceMap.set(reference.scopeId, [reference]);
    } else {
      current.push(reference);
    }
  }

  const result: Scope[] = [];

  visitScope(root, declarationMap, referenceMap, result);

  return result;
}

function visitScope(
  node: ScopeBuilderNode,
  declarationMap: ReadonlyMap<number, readonly Declaration[]>,
  referenceMap: ReadonlyMap<number, readonly Reference[]>,
  output: Scope[],
): void {
  const scope: Scope = {
    id: node.id,
    kind: node.kind,
    node: node.node,
    parentId: node.parentId,
    declarations: declarationMap.get(node.id) ?? [],
    references: referenceMap.get(node.id) ?? [],
    children: [],
  };

  output.push(scope);

  for (const child of node.children) {
    visitScope(child, declarationMap, referenceMap, output);
  }
}

function attachScopeIds(declarations: readonly Declaration[]): Declaration[] {
  return declarations.map((declaration) => ({
    name: declaration.name,
    kind: declaration.kind,
    node: declaration.node,
    location: declaration.location,
    scopeId: declaration.scopeId,
  }));
}

interface ScopeBuilderNode {
  readonly id: number;
  readonly kind: Scope["kind"];
  readonly node: TSESTree.Node;
  readonly parentId?: number;
  readonly children: readonly ScopeBuilderNode[];
}
