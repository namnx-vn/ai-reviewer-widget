import { parse } from "@typescript-eslint/typescript-estree";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

export function parseSource(source: string): TSESTree.Program {
  return parse(source, {
    jsx: true,
    loc: true,
    range: true,
    tokens: true,
    comment: true,
  });
}
