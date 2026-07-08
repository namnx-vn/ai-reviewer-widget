import type { ReactRule } from "./react-rule";
import type { DependencyHookConfiguration } from "../semantic/dependency-hooks";

export interface ReactPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly rules: readonly ReactRule[];
  /** Custom hooks which deliberately expose React-style dependency arrays. */
  readonly dependencyHooks?: readonly DependencyHookConfiguration[];
}
