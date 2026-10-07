import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../../../domain/review";
import type { ReactRule } from "../../../../engine/react-rule";
import { analyzeNextCacheModule } from "../../semantic/cache";

const RULE_ID = "next.cache.mutation-without-invalidation";

export const nextjsMutationWithoutCacheInvalidationRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect proven Prisma mutations in Server Actions without local cache invalidation or refresh.",
  rollout: "advisory",

  check(node, context) {
    if (node !== context.ast || !hasCacheComponents(context)) {
      return [];
    }

    return analyzeNextCacheModule(context).mutationActions
      .filter((entry) => entry.invalidations.length === 0)
      .map((entry) => createFinding(context.file, entry.mutation));
  },
};

function hasCacheComponents(
  context: Parameters<ReactRule["check"]>[1],
): boolean {
  const nextjs = context.framework?.nextjs;
  return (
    nextjs?.cacheComponents === true &&
    (nextjs.router === "app" || nextjs.router === "mixed")
  );
}

function createFinding(
  file: string,
  node: TSESTree.Node,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Server Action mutation has no local cache invalidation",
    message:
      "This Server Action performs a proven Prisma mutation but does not call revalidateTag(), updateTag(), or refresh() in the same action, so cached UI may remain stale.",
    severity: "medium",
    source: "ast",
    confidence: 0.95,
    location: { file, line, column },
    suggestion:
      "Invalidate the affected cache tag with updateTag() or revalidateTag(), or call refresh() when refreshing only the current client router is intended.",
  };
}
