import { analyzeAST } from "./ast/analyzer";
import { analyzeArchitecture } from "./architecture/analyzer";
import { noConsoleRule } from "./ast/rules/no-console";
import { noEvalRule } from "./ast/rules/no-eval";
import { noRemoteToRemoteImport } from "./architecture/rules";
import type { ReviewFinding } from "../review/types";

export function analyzeFile(
  file: string,
  source: string,
): ReviewFinding[] {
  if (!/\.(ts|tsx|mts|cts)$/.test(file)) {
    return [];
  }

  return [
    ...analyzeAST(
      source,
      file,
      [
        noConsoleRule,
        noEvalRule,
      ],
    ),

    ...analyzeArchitecture(
      file,
      source,
      [
        noRemoteToRemoteImport,
      ],
    ),
  ];
}