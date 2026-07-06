import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { ReviewFinding } from "../../review/types";
import type { HookContext } from "../semantic/hook-context";

export interface ReactRuleContext {
  readonly source: string;
  readonly file: string;
  readonly ast: TSESTree.Program;
  readonly hooks: HookContext;
}

export interface ReactRule {
  readonly id: string;
  readonly description: string;

  check(
    node: TSESTree.Node,
    context: ReactRuleContext,
  ): ReviewFinding[];
}