import type { ReactPlugin } from "./react-plugin";
import type { ReactPerformanceConfiguration, ReactRule } from "./react-rule";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import {
  createHookContext,
  type HookContext,
} from "../semantic/hook-context";
import type { DependencyHookConfiguration } from "../semantic/dependency-hooks";
import type { FrameworkContext } from "../semantic/framework-context";

export interface ReactAnalysisContext {
  readonly source: string;
  readonly file: string;
  readonly ast: TSESTree.Program;
  readonly hooks: HookContext;
  readonly rules: readonly ReactRule[];
  readonly dependencyHooks: readonly DependencyHookConfiguration[];
  readonly performance?: ReactPerformanceConfiguration;
  readonly framework?: FrameworkContext;
}

export function createReactAnalysisContext(
  source: string,
  file: string,
  ast: TSESTree.Program,
  plugins: readonly ReactPlugin[] = [],
  performance?: ReactPerformanceConfiguration,
  framework?: FrameworkContext,
): ReactAnalysisContext {
  const rules = getUniqueRules(plugins);
  const dependencyHooks = plugins.flatMap(
    (plugin) => plugin.dependencyHooks ?? [],
  );

  return {
    source,
    file,
    ast,
    hooks: createHookContext(ast),
    rules,
    dependencyHooks,
    performance,
    framework,
  };
}

function getUniqueRules(
  plugins: readonly ReactPlugin[],
): readonly ReactRule[] {
  const ruleIds = new Set<string>();
  const rules: ReactRule[] = [];

  for (const plugin of plugins) {
    for (const rule of plugin.rules) {
      if (ruleIds.has(rule.id)) {
        continue;
      }

      ruleIds.add(rule.id);
      rules.push(rule);
    }
  }

  return rules;
}
