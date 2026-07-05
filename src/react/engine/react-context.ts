import type { ReactPlugin } from "./react-plugin";
import type { ReactRule } from "./react-rule";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  createHookContext,
  type HookContext,
} from "../semantic/hook-context";

export interface ReactAnalysisContext {
  readonly source: string;
  readonly file: string;
  readonly ast: TSESTree.Program;
  readonly hooks: HookContext;
  readonly rules: readonly ReactRule[];
}

export function createReactAnalysisContext(
  source: string,
  file: string,
  ast: TSESTree.Program,
  plugins: readonly ReactPlugin[],
): ReactAnalysisContext {
  const rules = plugins.flatMap(
    (plugin) => plugin.rules,
  );

  return {
    source,
    file,
    ast,
    hooks: createHookContext(ast),
    rules,
  };
}