import type { TSESTree } from "@typescript-eslint/typescript-estree";
export function isConfiguredCritical(ancestors: readonly TSESTree.Node[], names: readonly string[] | undefined): boolean { for (const node of [...ancestors].reverse()) if (node.type === "FunctionDeclaration" && node.id) return (names ?? []).includes(node.id.name); return false; }
