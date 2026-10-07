import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { ReviewFinding } from "../../domain/review";
import type { HookContext } from "../semantic/hook-context";
import type { DependencyHookConfiguration } from "../semantic/dependency-hooks";
import type { FrameworkContext } from "../semantic/framework-context";

export interface ReactPerformanceConfiguration {
  readonly criticalUiComponents?: readonly string[];
}

export interface ReactRuleContext {
  readonly source: string;
  readonly file: string;
  readonly ast: TSESTree.Program;
  readonly hooks: HookContext;
  readonly dependencyHooks?: readonly DependencyHookConfiguration[];
  readonly performance?: ReactPerformanceConfiguration;
  readonly framework?: FrameworkContext;
}

export interface ReactRule {
  readonly id: string;
  readonly description: string;
  /** Unqualified rules remain visible but cannot affect review scoring. */
  readonly rollout?: "advisory" | "qualified";

  check(
    node: TSESTree.Node,
    context: ReactRuleContext,
  ): ReviewFinding[];
}
