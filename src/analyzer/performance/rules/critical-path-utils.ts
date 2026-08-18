import type { TSESTree } from "@typescript-eslint/typescript-estree";

export function isConfiguredCritical(
  ancestors: readonly TSESTree.Node[],
  names: readonly string[] | undefined,
): boolean {
  const configured = new Set(names ?? []);
  if (configured.size === 0) return false;

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index];
    if (node === undefined) continue;

    if (node.type === "FunctionDeclaration") {
      return node.id !== null && configured.has(node.id.name);
    }

    if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") {
      continue;
    }

    if (node.type === "FunctionExpression" && node.id !== null) {
      return configured.has(node.id.name);
    }

    const parent = ancestors[index - 1];
    if (parent?.type === "VariableDeclarator"
      && parent.id.type === "Identifier"
      && parent.init === node) {
      return configured.has(parent.id.name);
    }

    return false;
  }

  return false;
}
