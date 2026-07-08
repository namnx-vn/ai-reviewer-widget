import type { ReactPlugin } from "../engine/react-plugin";
import { reactHooksAsyncEffectRule } from "../rules/hooks/async-effect";
import { reactHooksConditionalRule } from "../rules/hooks/conditional";
import { reactHooksInvalidOrderRule } from "../rules/hooks/invalid-order";
import { reactHooksMissingDepsRule } from "../rules/hooks/missing-deps";
import { reactHooksStaleClosureRule } from "../rules/hooks/stale-closure";
import { reactHooksUnnecessaryEffectRule } from "../rules/hooks/unnecessary-effect";
import {
  reactRenderingCallbackMisuseRule,
  reactRenderingKeyMisuseRule,
  reactRenderingMemoBoundaryRule,
  reactRenderingMemoMisuseRule,
  reactRenderingUnnecessaryRerenderRule,
  reactRenderingUnstablePropsRule,
} from "../rules/rendering";

export const reactPlugin: ReactPlugin = {
  id: "react",
  name: "React",
  version: "3.4.4",
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
  ],
};
