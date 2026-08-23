import { parseSource } from "../ast/parser";
import type { ReviewWarning } from "../../domain/review";
import type { AnalyzerSourceFile } from "./contracts";

const SOURCE_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export interface PreparedAnalyzerFiles {
  readonly files: readonly AnalyzerSourceFile[];
  readonly sourceFiles: readonly AnalyzerSourceFile[];
  readonly warnings: readonly ReviewWarning[];
}

export function prepareAnalyzerFiles(
  files: readonly AnalyzerSourceFile[],
): PreparedAnalyzerFiles {
  const sourceFiles: AnalyzerSourceFile[] = [];
  const invalidSourcePaths = new Set<string>();
  const warnings: ReviewWarning[] = [];

  for (const file of files) {
    if (!isSourceFile(file.path)) continue;
    try {
      parseSource(file.content);
      sourceFiles.push(file);
    } catch {
      invalidSourcePaths.add(file.path);
      warnings.push({
        code: "SOURCE_PARSE_FAILED",
        message: `Skipped deterministic analysis for ${file.path} because it could not be parsed.`,
      });
    }
  }

  return {
    files: files.filter((file) => !invalidSourcePaths.has(file.path)),
    sourceFiles,
    warnings,
  };
}

export function isSourceFile(path: string): boolean {
  return SOURCE_FILE_PATTERN.test(path);
}
