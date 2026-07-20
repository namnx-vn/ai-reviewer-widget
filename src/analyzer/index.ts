import { analyzeAST } from "./ast/analyzer";
import { analyzeArchitecture, analyzeArchitectureGraph, buildDependencyGraph } from "./architecture/analyzer";
import { noConsoleRule } from "./ast/rules/no-console";
import { noEvalRule } from "./ast/rules/no-eval";
import { noRemoteToRemoteImport } from "./architecture/rules";
import type { ReviewFinding } from "../review/types";
import { analyzeMicroFrontends } from "../mfe";
import { analyzeSecurityFindings } from "./security/review-findings";

export function analyzeFile(
  file: string,
  source: string,
): ReviewFinding[] {
  if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file)) {
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
    ...analyzeSecurityFindings(file, source),
  ];
}

export function analyzeFiles(files: readonly { path: string; content: string }[]): ReviewFinding[] {
  const astFindings = files.flatMap(({ path, content }) =>
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path)
      ? analyzeAST(content, path, [noConsoleRule, noEvalRule])
      : [],
  );
  const securityFindings = files.flatMap(({ path, content }) =>
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path)
      ? analyzeSecurityFindings(path, content)
      : [],
  );
  return [
    ...astFindings,
    ...securityFindings,
    ...analyzeArchitectureGraph(buildDependencyGraph(files), [noRemoteToRemoteImport]),
    ...analyzeMicroFrontends(files).findings,
  ];
}
