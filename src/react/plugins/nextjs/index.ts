export {
  nextjsAsyncClientComponentRule,
  nextjsClientHookInServerComponentRule,
  nextjsEventHandlerInServerComponentRule,
  nextjsInvalidClientDirectivePlacementRule,
  nextjsServerImportInClientComponentRule,
} from "./app-router-rules";

import {
  nextjsAsyncClientComponentRule,
  nextjsClientHookInServerComponentRule,
  nextjsEventHandlerInServerComponentRule,
  nextjsInvalidClientDirectivePlacementRule,
  nextjsServerImportInClientComponentRule,
} from "./app-router-rules";
import type { ReactPlugin } from "../../engine/react-plugin";

/** Optional App Router rules; register this plugin only for established Next.js projects. */
export const nextjsPlugin: ReactPlugin = {
  id: "nextjs",
  name: "Next.js App Router",
  version: "3.4.9",
  rules: [
    nextjsClientHookInServerComponentRule,
    nextjsEventHandlerInServerComponentRule,
    nextjsServerImportInClientComponentRule,
    nextjsAsyncClientComponentRule,
    nextjsInvalidClientDirectivePlacementRule,
  ],
};
