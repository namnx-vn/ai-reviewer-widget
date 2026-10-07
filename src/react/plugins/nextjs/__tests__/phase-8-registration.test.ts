import { describe, expect, it } from "vitest";

import { nextjsPlugin } from "..";

describe("Phase 8 Next.js rule registration", () => {
  it("registers every advisory Phase 8 rule", () => {
    expect(nextjsPlugin.rules.map((rule) => rule.id)).toEqual(expect.arrayContaining([
      "next.app.invalid-metadata-client-component",
      "next.app.route-handler-runtime-conflict",
      "next.navigation.async-waterfall",
      "next.runtime.node-import-in-edge",
      "next.cache.request-data-inside-cache",
      "next.cache.mutation-without-invalidation",
      "next.cache.tag-never-invalidated",
      "nextjs.actions.unvalidated-mutation-input",
      "nextjs.actions.client-controlled-owner",
      "nextjs.actions.sensitive-return",
    ]));
  });
});
