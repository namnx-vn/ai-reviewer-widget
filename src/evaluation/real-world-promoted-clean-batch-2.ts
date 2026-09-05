import type { RealWorldSeedDefinition } from "./real-world";

const BUNDLE_PATH = "evaluation/fixtures/real-world/promoted-clean-batch-2.json";

export const PROMOTED_CLEAN_BATCH_2_SEEDS: readonly RealWorldSeedDefinition[] = [
  {
    id: "vercel-next-96772-promise-resolvers-refactor",
    title: "Shared Promise.withResolvers helper refactor should remain low-noise",
    category: "clean-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-96772-promise-resolvers-refactor.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-96772-promise-resolvers-refactor" },
    source: { repository: "vercel/next.js", number: 96772, url: "https://github.com/vercel/next.js/pull/96772", headSha: "2b12171bd518ae298ee220db0dee47cce469cb9a" },
    expectations: [{
      id: "clean-promise-resolvers-refactor",
      kind: "must-not-find",
      title: "Do not invent lifecycle findings for a behavior-preserving deferred-promise consolidation",
      rationale: "The merged refactor replaces duplicate implementations with one shared helper and validated the affected bundle and focused tests.",
    }],
  },
  {
    id: "tanstack-query-11369-solid-jsdoc-negative",
    title: "Solid Query JSDoc and generated reference migration should remain low-noise",
    category: "clean-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-11369-solid-jsdoc-negative.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-11369-solid-jsdoc-negative" },
    source: { repository: "TanStack/query", number: 11369, url: "https://github.com/TanStack/query/pull/11369", headSha: "0fd9ff23b2cf20c3a41a8731ee29476c5a936bc3" },
    expectations: [{
      id: "clean-solid-jsdoc",
      kind: "must-not-find",
      title: "Do not invent production findings for documentation-only JSDoc and TypeDoc reference work",
      rationale: "The merged PR is explicitly docs/CI/dev-only and does not change released runtime behavior.",
    }],
  },
  {
    id: "tanstack-query-11368-solid-doc-generator-negative",
    title: "Solid Query documentation generator entry point should remain low-noise",
    category: "clean-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-11368-solid-doc-generator-negative.ts",
    analysisPath: "scripts/generate-docs.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-11368-solid-doc-generator-negative" },
    source: { repository: "TanStack/query", number: 11368, url: "https://github.com/TanStack/query/pull/11368", headSha: "4f81984fdc67235149269e4404a17ee1ee94847c" },
    expectations: [{
      id: "clean-doc-generator-entry",
      kind: "must-not-find",
      title: "Do not invent production findings for a documentation-generator configuration entry",
      rationale: "The merged change only wires a TypeDoc entry point; upstream CI and automated review reported no actionable risk.",
    }],
  },
  {
    id: "tanstack-query-11378-vue-jsdoc-negative",
    title: "Vue Query JSDoc and generated reference migration should remain low-noise",
    category: "clean-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-11378-vue-jsdoc-negative.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-11378-vue-jsdoc-negative" },
    source: { repository: "TanStack/query", number: 11378, url: "https://github.com/TanStack/query/pull/11378", headSha: "9c1e484ca6922eef54e431a3a06ee92bde693d17" },
    expectations: [{
      id: "clean-vue-jsdoc",
      kind: "must-not-find",
      title: "Do not invent runtime findings for documentation-only Vue Query JSDoc work",
      rationale: "The merged PR is explicitly docs/CI/dev-only; runtime examples were corrected in prose and generated reference output without release behavior changes.",
    }],
  },
];
