import type { RealWorldSeedDefinition } from "./real-world";

const BUNDLE_PATH = "evaluation/fixtures/real-world/promoted-react-batch-1.json";

export const PROMOTED_REACT_SEEDS: readonly RealWorldSeedDefinition[] = [
  {
    id: "tanstack-query-10079-query-promise-reset",
    title: "Query retry can expose a stale promise to Suspense",
    category: "react-lifecycle",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-10079-query-promise-reset.tsx",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-10079-query-promise-reset" },
    source: {
      repository: "TanStack/query",
      number: 10079,
      url: "https://github.com/TanStack/query/pull/10079",
      headSha: "714297c168d82e0cbe90b297189e2d5486e315d6",
    },
    expectations: [
      {
        id: "stale-query-promise",
        kind: "must-find",
        title: "Refresh the exposed promise when a failed query retries",
        severity: "medium",
        rationale: "The PR fixes useQuery().promise retaining an obsolete promise when retry transitions the query back to fetching.",
      },
    ],
  },
  {
    id: "tanstack-query-11270-null-hydration",
    title: "Hydration runs with an absent server state",
    category: "react-lifecycle",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-11270-null-hydration.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-11270-null-hydration" },
    source: {
      repository: "TanStack/query",
      number: 11270,
      url: "https://github.com/TanStack/query/pull/11270",
      headSha: "36073308ad9f7ec6bb3bd4a766657d62c1d800eb",
    },
    expectations: [
      {
        id: "unguarded-hydration-state",
        kind: "must-find",
        title: "Guard optional dehydrated state before hydrating on the client",
        severity: "medium",
        rationale: "The example could call hydrate with null/undefined state on client-only routes after the core runtime guard was removed.",
      },
    ],
  },
  {
    id: "tanstack-query-11385-mount-subscription-race",
    title: "Cached query updates can be lost between mount read and observer attachment",
    category: "react-lifecycle",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-11385-mount-subscription-race.tsx",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-11385-mount-subscription-race" },
    source: {
      repository: "TanStack/query",
      number: 11385,
      url: "https://github.com/TanStack/query/pull/11385",
      headSha: "518c5c76f81ccefe96fb87e9860278253cfb275c",
    },
    expectations: [
      {
        id: "mount-subscription-gap",
        kind: "must-find",
        title: "Avoid a subscription gap that can lose cache updates during mount",
        severity: "medium",
        rationale: "The PR defers observer attachment until the conditional subtree is ready while preserving synchronous optimistic status.",
      },
    ],
  },
  {
    id: "tanstack-query-10006-devtools-isolation",
    title: "Module-scoped devtools state leaks across multiple provider instances",
    category: "react-state",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-10006-devtools-isolation.tsx",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-10006-devtools-isolation" },
    source: {
      repository: "TanStack/query",
      number: 10006,
      url: "https://github.com/TanStack/query/pull/10006",
      headSha: "638e742d7c6c1ddf9f3a75491af27d9abb9d7c05",
    },
    expectations: [
      {
        id: "cross-instance-state-leak",
        kind: "must-find",
        title: "Keep devtools instance state isolated per provider",
        severity: "medium",
        rationale: "The PR moves instance-specific panel/selection/cache state into context because global sharing caused multiple devtools instances to interfere.",
      },
    ],
  },
  {
    id: "vercel-next-96252-pre-hydration-navigation-race",
    title: "A history traversal can happen before hydration subscribes to navigation state",
    category: "react-lifecycle",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-96252-pre-hydration-navigation-race.tsx",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-96252-pre-hydration-navigation-race" },
    source: {
      repository: "vercel/next.js",
      number: 96252,
      url: "https://github.com/vercel/next.js/pull/96252",
      headSha: "e4a0892dd0cef6cf83d818d20664319f357d9245",
    },
    expectations: [
      {
        id: "missed-pre-hydration-traversal",
        kind: "must-find",
        title: "Reconcile navigation state when history changes before hydration listeners attach",
        severity: "medium",
        rationale: "The merged fix detects that hydration started on a stale history entry and replays the missed traversal.",
      },
    ],
  },
  {
    id: "vercel-next-93154-search-param-cache-collision",
    title: "Repeated search parameters collapse to the same client cache key",
    category: "react-state",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-93154-search-param-cache-collision.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-93154-search-param-cache-collision" },
    source: {
      repository: "vercel/next.js",
      number: 93154,
      url: "https://github.com/vercel/next.js/pull/93154",
      headSha: "c4f6e18cd9ed9e43fa0e8ed7819040284137f4d0",
    },
    expectations: [
      {
        id: "multi-value-search-param-collision",
        kind: "must-find",
        title: "Preserve repeated URLSearchParams values when constructing client cache keys",
        severity: "medium",
        rationale: "Object.fromEntries drops repeated values, causing multi-value and single-value queries to collide and stale UI state to be reused.",
      },
    ],
  },
  {
    id: "tanstack-query-11260-partial-hydration-safe",
    title: "Partial dehydrated state uses optional collection access",
    category: "react-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-11260-partial-hydration-safe.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-11260-partial-hydration-safe" },
    source: {
      repository: "TanStack/query",
      number: 11260,
      url: "https://github.com/TanStack/query/pull/11260",
      headSha: "bdb1f6c662f6f9026613ba586ca48668ba0569d9",
    },
    expectations: [
      {
        id: "partial-hydration-safe",
        kind: "must-not-find",
        title: "Do not flag optional hydration collections that are intentionally supported",
        rationale: "The merged change accepts partial dehydrated state and safely skips absent mutation/query arrays.",
      },
    ],
  },
];
