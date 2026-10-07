import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../../../domain/review";
import type { ReactRule } from "../../../../engine/react-rule";
import { analyzeNextCacheModule } from "../../semantic/cache";

const RULE_ID = "next.cache.request-data-inside-cache";

export const nextjsRequestDataInsideCacheRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect request-scoped Next.js APIs called inside shared use cache boundaries.",
  rollout: "advisory",

  check(node, context) {
    if (node !== context.ast || !hasCacheComponents(context)) {
      return [];
    }

    return analyzeNextCacheModule(context).requestAccesses.map(({ api, call }) =>
      createFinding(context.file, call, api),
    );
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
  api: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Request data read inside a shared cache boundary",
    message:
      `${api}() reads request-scoped data inside a "use cache" boundary, which cannot safely share that value across requests.`,
    severity: "high",
    source: "ast",
    confidence: 1,
    location: { file, line, column },
    suggestion:
      `Read ${api}() outside the cached scope and pass the required value as an argument, or use "use cache: private" when private caching is intentional.`,
  };
}
