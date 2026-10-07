export {
  nextjsAsyncClientComponentRule,
  nextjsClientHookInServerComponentRule,
  nextjsEventHandlerInServerComponentRule,
  nextjsInvalidClientDirectivePlacementRule,
  nextjsServerImportInClientComponentRule,
} from "./app-router-rules";
export {
  nextjsInvalidMetadataClientComponentRule,
  nextjsRouteHandlerRuntimeConflictRule,
} from "./rules/app-router";
export { nextjsServerActionSecurityRules } from "./rules/actions";
export {
  nextjsMismatchedCacheTagInvalidationRule,
  nextjsMutationWithoutCacheInvalidationRule,
  nextjsRequestDataInsideCacheRule,
} from "./rules/cache";
export { nextjsIndependentAwaitWaterfallRule } from "./rules/navigation";
export { nextjsNodeImportInEdgeRuntimeRule } from "./rules/runtime";
export {
  getAppRouterSpecialFileRole,
  type AppRouterSpecialFileRole,
} from "./semantic/route-segment";

import {
  nextjsAsyncClientComponentRule,
  nextjsClientHookInServerComponentRule,
  nextjsEventHandlerInServerComponentRule,
  nextjsInvalidClientDirectivePlacementRule,
  nextjsServerImportInClientComponentRule,
} from "./app-router-rules";
import {
  nextjsInvalidMetadataClientComponentRule,
  nextjsRouteHandlerRuntimeConflictRule,
} from "./rules/app-router";
import { nextjsServerActionSecurityRules } from "./rules/actions";
import {
  nextjsMismatchedCacheTagInvalidationRule,
  nextjsMutationWithoutCacheInvalidationRule,
  nextjsRequestDataInsideCacheRule,
} from "./rules/cache";
import { nextjsIndependentAwaitWaterfallRule } from "./rules/navigation";
import { nextjsNodeImportInEdgeRuntimeRule } from "./rules/runtime";
import type { ReactPlugin } from "../../engine/react-plugin";

/** Optional App Router rules; register this plugin only for established Next.js projects. */
export const nextjsPlugin: ReactPlugin = {
  id: "nextjs",
  name: "Next.js App Router",
  version: "8.0.0",
  rules: [
    nextjsClientHookInServerComponentRule,
    nextjsEventHandlerInServerComponentRule,
    nextjsServerImportInClientComponentRule,
    nextjsAsyncClientComponentRule,
    nextjsInvalidClientDirectivePlacementRule,
    nextjsInvalidMetadataClientComponentRule,
    nextjsRouteHandlerRuntimeConflictRule,
    nextjsIndependentAwaitWaterfallRule,
    nextjsNodeImportInEdgeRuntimeRule,
    nextjsRequestDataInsideCacheRule,
    nextjsMutationWithoutCacheInvalidationRule,
    nextjsMismatchedCacheTagInvalidationRule,
    ...nextjsServerActionSecurityRules,
  ],
};
