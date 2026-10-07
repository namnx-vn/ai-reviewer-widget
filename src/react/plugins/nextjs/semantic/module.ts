import type { TSESTree } from "@typescript-eslint/typescript-estree";

export function isClientModule(program: TSESTree.Program): boolean {
  const firstStatement = program.body[0];

  return firstStatement !== undefined &&
    firstStatement.type === "ExpressionStatement" &&
    firstStatement.expression.type === "Literal" &&
    firstStatement.expression.value === "use client";
}

export function findDirectExport(
  program: TSESTree.Program,
  exportName: string,
): TSESTree.Node | undefined {
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = statement.declaration;
    if (
      declaration?.type === "FunctionDeclaration" &&
      declaration.id?.name === exportName
    ) {
      return declaration;
    }

    if (declaration?.type === "VariableDeclaration") {
      const declarator = declaration.declarations.find(
        (candidate) => candidate.id.type === "Identifier" && candidate.id.name === exportName,
      );
      if (declarator !== undefined) {
        return declarator;
      }
    }
  }

  return undefined;
}

export function getDeclaredRuntime(
  program: TSESTree.Program,
): "edge" | "nodejs" | undefined {
  const runtimeExport = findDirectExport(program, "runtime");

  if (
    runtimeExport?.type !== "VariableDeclarator" ||
    runtimeExport.init?.type !== "Literal"
  ) {
    return undefined;
  }

  return runtimeExport.init.value === "edge" || runtimeExport.init.value === "nodejs"
    ? runtimeExport.init.value
    : undefined;
}
