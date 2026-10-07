import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../../../domain/review";
import type { ReactRule } from "../../../../engine/react-rule";
import { analyzeNextCacheModule } from "../../semantic/cache";

const RULE_ID = "next.cache.tag-never-invalidated";

export const nextjsMismatchedCacheTagInvalidationRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect statically mismatched cache tags for a locally related cached Prisma read and Server Action mutation.",
  rollout: "advisory",

  check(node, context) {
    if (node !== context.ast || !hasCacheComponents(context)) {
      return [];
    }

    return analyzeNextCacheModule(context).mutationActions
      .filter(hasDeterministicTagMismatch)
      .map((entry) => createFinding(
        context.file,
        entry.mutation,
        entry.cachedTags,
        entry.invalidatedTags,
      ));
  },
};

function hasDeterministicTagMismatch(
  entry: ReturnType<typeof analyzeNextCacheModule>["mutationActions"][number],
): boolean {
  return (
    entry.cachedTags.length > 0 &&
    entry.invalidations.length > 0 &&
    entry.invalidatedTags.length === entry.invalidations.length &&
    !entry.cachedTags.some((tag) => entry.invalidatedTags.includes(tag))
  );
}

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
  cachedTags: readonly string[],
  invalidatedTags: readonly string[],
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Related cached data is invalidated with a different tag",
    message:
      `This Server Action mutates data read by a local cached function tagged ${formatTags(cachedTags)}, but it only invalidates ${formatTags(invalidatedTags)}.`,
    severity: "medium",
    source: "ast",
    confidence: 1,
    location: { file, line, column },
    suggestion:
      `Invalidate one of the related cache tags (${cachedTags.join(", ")}) with updateTag() or revalidateTag().`,
  };
}

function formatTags(tags: readonly string[]): string {
  return tags.map((tag) => `"${tag}"`).join(", ");
}
