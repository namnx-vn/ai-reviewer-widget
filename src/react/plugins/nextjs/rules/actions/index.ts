export {
  nextjsClientControlledOwnerRule,
  nextjsSensitiveActionReturnRule,
  nextjsUnvalidatedActionMutationRule,
} from "./action-security-rules";

import {
  nextjsClientControlledOwnerRule,
  nextjsSensitiveActionReturnRule,
  nextjsUnvalidatedActionMutationRule,
} from "./action-security-rules";
import type { ReactRule } from "../../../../engine/react-rule";

export const nextjsServerActionSecurityRules: readonly ReactRule[] = [
  nextjsUnvalidatedActionMutationRule,
  nextjsClientControlledOwnerRule,
  nextjsSensitiveActionReturnRule,
];
