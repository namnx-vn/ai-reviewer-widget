import { parse } from "@typescript-eslint/typescript-estree";

export function parseSource(source: string) {
  return parse(source, {
    jsx: true,
    loc: true,
    range: true,
    tokens: true,
    comment: true,
  });
}