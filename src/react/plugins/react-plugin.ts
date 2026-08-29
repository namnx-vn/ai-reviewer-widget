import type { ReactPlugin } from "../engine/react-plugin";
import { reactHooksAsyncEffectRule } from "../rules/hooks/async-effect";
import { reactHooksConditionalRule } from "../rules/hooks/conditional";
import { reactHooksInvalidOrderRule } from "../rules/hooks/invalid-order";
import { reactHooksMissingDepsRule } from "../rules/hooks/missing-deps";
import { reactHooksStaleClosureRule } from "../rules/hooks/stale-closure";
import { reactHooksUnnecessaryEffectRule } from "../rules/hooks/unnecessary-effect";
import {
  reactPerformanceExpensiveRenderWorkRule,
  reactPerformanceRepeatedDerivedComputationRule,
  reactPerformanceRenderTimeConstructionRule,
  reactPerformanceTrivialUseMemoRule,
  reactPerformanceUnboundedListRenderRule,
} from "../rules/performance";
import {
  reactRenderingCallbackMisuseRule,
  reactRenderingKeyMisuseRule,
  reactRenderingMemoBoundaryRule,
  reactRenderingMemoMisuseRule,
  reactRenderingUnnecessaryRerenderRule,
  reactRenderingUnstablePropsRule,
} from "../rules/rendering";
import {
  reactStateDerivedStateRule,
  reactStateMutationRule,
  reactStateRedundantStateRule,
  reactStateSynchronizationRule,
} from "../rules/state";

export const reactPlugin: ReactPlugin = {
  id: "react",
  name: "React",
  version: "3.4.6",
  rules: [
    reactHooksMissingDepsRule,
    reactHooksStaleClosureRule,
    reactHooksConditionalRule,
    reactHooksInvalidOrderRule,
    reactHooksUnnecessaryEffectRule,
    reactHooksAsyncEffectRule,
    reactRenderingCallbackMisuseRule,
    reactRenderingKeyMisuseRule,
    reactRenderingUnnecessaryRerenderRule,
    reactRenderingUnstablePropsRule,
    reactRenderingMemoMisuseRule,
    reactRenderingMemoBoundaryRule,
    reactStateMutationRule,
    reactStateDerivedStateRule,
    reactStateRedundantStateRule,
    reactStateSynchronizationRule,
    reactPerformanceExpensiveRenderWorkRule,
    reactPerformanceUnboundedListRenderRule,
    reactPerformanceTrivialUseMemoRule,
    reactPerformanceRepeatedDerivedComputationRule,
    reactPerformanceRenderTimeConstructionRule,
  ],
};
