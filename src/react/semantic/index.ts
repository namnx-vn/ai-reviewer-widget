export {
  analyzeHooks,
  type HookAnalysisResult,
  type HookLocation,
  type HookMetadata,
} from "./hook-analyzer";

export {
  createHookContext,
  type FunctionBoundary,
  type HookContext,
  type HookExecutionContext,
  type HookExecutionKind,
  type SemanticHookMetadata,
} from "./hook-context";

export {
  getDependencyHookConfiguration,
  analyzeDependencyHookCall,
  REACT_DEPENDENCY_HOOKS,
  type DependencyHookCallAnalysis,
  type DependencyHookConfiguration,
  type ResolvedDependencyHookConfiguration,
} from "./dependency-hooks";
