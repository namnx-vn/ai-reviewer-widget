import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { DeclarationInput } from "./scope-utils";
import type { ScopeBuildResult } from "./scope-builder";
import type { Reference } from "./scope-types";
import { visitNode } from "./reference-visitors";

export interface ReferenceAnalysisResult {
  readonly references: readonly Reference[];
}

export function analyzeReferences(
  ast: TSESTree.Program,
  scopeBuild: ScopeBuildResult,
  declarations: readonly DeclarationInput[],
  declarationNodes: ReadonlySet<TSESTree.Identifier>,
): ReferenceAnalysisResult {
  const declarationMap = new Map<string, DeclarationInput[]>();

  for (const declaration of declarations) {
    const existing = declarationMap.get(declaration.name);

    if (existing === undefined) {
      declarationMap.set(declaration.name, [declaration]);
      continue;
    }

    existing.push(declaration);
  }

  const references: Reference[] = [];

  visitNode(
    ast,
    scopeBuild.rootScope,
    scopeBuild,
    declarationNodes,
    declarationMap,
    references,
  );

  return {
    references,
  };
}
