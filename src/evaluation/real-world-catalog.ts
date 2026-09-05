export type RealWorldCatalogCategory =
  | "security"
  | "react-hooks"
  | "performance"
  | "nextjs-rsc"
  | "clean";

export type RealWorldCatalogSignal =
  | "positive-candidate"
  | "negative-control"
  | "manual-review";

export type RealWorldCatalogMaturity = "catalogued" | "minimized";

export interface RealWorldCatalogEntry {
  readonly repository: string;
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly category: RealWorldCatalogCategory;
  readonly signal: RealWorldCatalogSignal;
  readonly maturity: RealWorldCatalogMaturity;
  readonly fixtureId?: string;
}

function pr(
  repository: string,
  number: number,
  title: string,
  category: RealWorldCatalogCategory,
  signal: RealWorldCatalogSignal,
  maturity: RealWorldCatalogMaturity = "catalogued",
  fixtureId?: string,
): RealWorldCatalogEntry {
  return {
    repository,
    number,
    url: `https://github.com/${repository}/pull/${number}`,
    title,
    category,
    signal,
    maturity,
    fixtureId,
  };
}

export const REAL_WORLD_PR_CATALOG: readonly RealWorldCatalogEntry[] = [
  // Security — 20
  pr("vercel/next.js", 86406, "examples: add with-health-check example", "security", "positive-candidate", "minimized", "vercel-next-86406-health-endpoint"),
  pr("vercel/next.js", 86408, "fix(eslint-plugin): respect custom pageExtensions in no-html-link-for-pages rule", "security", "manual-review", "minimized", "vercel-next-86408-config-loader"),
  pr("vercel/next.js", 95574, "Add experimental WebSocket route handlers", "security", "negative-control", "minimized", "vercel-next-95574-websocket-route-hardening"),
  pr("vercel/next.js", 96449, "Harden and classify Request Insights activity", "security", "negative-control", "minimized", "vercel-next-96449-request-insights-hints"),
  pr("vercel/next.js", 96902, "Establish Request Insights classification and isolation", "security", "negative-control", "minimized", "vercel-next-96902-instant-insights-isolation"),
  pr("vercel/next.js", 98265, "fix(next/image): follow redirects from a relative image src (#98237)", "security", "negative-control", "minimized", "vercel-next-98265-image-redirect-guard"),
  pr("vercel/next.js", 96608, "fix(app-render): add nonce to loading/template/error segment script tags", "security", "positive-candidate", "minimized", "vercel-next-96608-csp-segment-nonce"),
  pr("vercel/next.js", 97043, "Thread CSP nonce to the React render in Pages Router", "security", "positive-candidate", "minimized", "vercel-next-97043-pages-csp-nonce"),
  pr("vercel/next.js", 98152, "Add CSP nonce to script tags of loading and template files", "security", "positive-candidate", "minimized", "vercel-next-98152-loading-template-csp-nonce"),
  pr("vercel/next.js", 98197, "Add Next Maintainer auto-close workflow", "security", "negative-control", "minimized", "vercel-next-98197-maintainer-auto-close-oidc"),
  pr("vercel/next.js", 97027, "Add bounded WebSocket transport primitives", "security", "negative-control", "minimized", "vercel-next-97027-bounded-websocket-transport"),
  pr("TanStack/query", 11381, "docs(preact-query): fix XSS-unsafe example and missing staleTime in SSR guide", "security", "positive-candidate", "minimized", "tanstack-query-11381-ssr-script-xss"),
  pr("vercel/next.js", 95123, "inherit allowedDevOrigins into serverActions.allowedOrigins", "security", "manual-review", "minimized", "vercel-next-95123-dev-origin-inheritance"),
  pr("vercel/next.js", 95238, "fix(cache-components): decompress postponed resume body before parsing", "security", "negative-control", "minimized", "vercel-next-95238-bounded-resume-decompression"),
  pr("vercel/next.js", 97252, "Add a script for adopting fork pull requests", "security", "manual-review", "minimized", "vercel-next-97252-pr-adopt-confirmation"),
  pr("vercel/next.js", 96552, "Preserve the original host on forwarded Server Action requests", "security", "manual-review", "minimized", "vercel-next-96552-forwarded-action-host-guard"),
  pr("vercel/next.js", 96977, "Preserve the original host on action redirect streams", "security", "negative-control", "minimized", "vercel-next-96977-action-redirect-host-guard"),
  pr("vercel/next.js", 98105, "Respond with 400 when a Server Action body cannot be decoded", "security", "manual-review", "minimized", "vercel-next-98105-action-decode-status"),
  pr("vercel/next.js", 95182, "server actions: enforce bodySizeLimit in edge runtime for multipart and non-multipart bodies", "security", "positive-candidate", "minimized", "vercel-next-95182-edge-action-body-limit"),
  pr("vercel/next.js", 96580, "Keep loaded env when a forced .env reload reads nothing", "security", "positive-candidate", "minimized", "vercel-next-96580-env-fifo-reload"),

  // React / hooks / reactive lifecycle — 15
  pr("TanStack/query", 11385, "fix(solid-query): prevent lost updates when mounting cached queries", "react-hooks", "positive-candidate", "minimized", "tanstack-query-11385-mount-subscription-race"),
  pr("TanStack/query", 10006, "fix(devtools): isolate instance-specific settings with context", "react-hooks", "positive-candidate", "minimized", "tanstack-query-10006-devtools-isolation"),
  pr("TanStack/query", 10079, "fix(react-query): retry useQuery().promise on error boundary reset", "react-hooks", "positive-candidate", "minimized", "tanstack-query-10079-query-promise-reset"),
  pr("TanStack/query", 11403, "test(vue-query/useMutation): cover optimistic rollback and concurrent calls", "react-hooks", "negative-control", "minimized", "tanstack-query-11403-vue-mutation-tests-negative"),
  pr("TanStack/query", 11402, "test(vue-query/useInfiniteQuery): cover reactive options and page transitions", "react-hooks", "negative-control", "minimized", "tanstack-query-11402-vue-infinite-query-tests-negative"),
  pr("TanStack/query", 11270, "fix(examples/vue/nuxt3): guard hydrate() against a null dehydrated state", "react-hooks", "positive-candidate", "minimized", "tanstack-query-11270-null-hydration"),
  pr("TanStack/query", 11260, "fix(query-core): accept partial dehydrated state", "react-hooks", "negative-control", "minimized", "tanstack-query-11260-partial-hydration-safe"),
  pr("TanStack/query", 11326, "feat(solid-query): built-in single-flight consumer via FLIGHT_DATA_SOURCE", "react-hooks", "positive-candidate", "minimized", "tanstack-query-11326-solid-query-ssr-teardown"),
  pr("TanStack/query", 11308, "feat(solid-query): rewrite the adapter onto Solid 2.0 native async model", "react-hooks", "manual-review", "minimized", "tanstack-query-11308-solid2-native-async-adapter"),
  pr("TanStack/query", 11395, "feat(query-core): allow overriding dehydration timestamp", "react-hooks", "positive-candidate", "minimized", "tanstack-query-11395-dehydration-timestamp"),
  pr("vercel/next.js", 96252, "Fix race when navigating Back before hydration", "react-hooks", "positive-candidate", "minimized", "vercel-next-96252-pre-hydration-navigation-race"),
  pr("vercel/next.js", 83200, "fix: web manifest should always be emitted in head", "react-hooks", "positive-candidate", "minimized", "vercel-next-83200-manifest-streaming-head"),
  pr("vercel/next.js", 91586, "perf: skip context.with() and span overhead for noop tracer", "react-hooks", "positive-candidate", "minimized", "vercel-next-91586-noop-tracer-force-context"),
  pr("vercel/next.js", 93154, "fix(router): preserve multi-value search params in segment cache key", "react-hooks", "positive-candidate", "minimized", "vercel-next-93154-search-param-cache-collision"),
  pr("vercel/next.js", 96735, "Upgrade React from 7dfc7ccd-20260803 to 11eddecd-20260805", "react-hooks", "negative-control", "minimized", "vercel-next-96735-react-version-upgrade-negative"),

  // Performance — 20
  pr("vercel/next.js", 91593, "perf: reduce React element creation in component tree", "performance", "negative-control", "minimized", "vercel-next-91593-component-tree-negative"),
  pr("vercel/next.js", 97714, "Reduce Turbopack cache size with per-family compression", "performance", "manual-review"),
  pr("vercel/next.js", 91597, "perf: skip rewrite processing when no rewrites configured", "performance", "manual-review"),
  pr("vercel/next.js", 96808, "turbo-tasks: execute scheduled tasks inline when they are read", "performance", "manual-review"),
  pr("vercel/next.js", 98277, "Use Papaya for resident task storage", "performance", "negative-control"),
  pr("vercel/next.js", 97203, "[turbopack] Lazily compile dynamic imports in development (client side)", "performance", "manual-review"),
  pr("vercel/next.js", 97672, "Turbopack: mangle exported names for smaller bundle sizes", "performance", "manual-review"),
  pr("vercel/next.js", 97808, "Upgrade Turbopack to hashbrown 0.15", "performance", "manual-review"),
  pr("vercel/next.js", 97771, "[turbopack] simplify ecmascript effect queue", "performance", "negative-control"),
  pr("vercel/next.js", 96771, "[Bench] Fixes for pure Fizz bench", "performance", "manual-review"),
  pr("vercel/next.js", 98281, "Add offline zstd dictionary tooling", "performance", "manual-review"),
  pr("vercel/next.js", 96542, "fix(next/image): don't hang cold transforms when the requester aborts", "performance", "positive-candidate"),
  pr("vercel/next.js", 96245, "Only advance the Turbopack HMR hash when compiled output actually changed", "performance", "manual-review"),
  pr("vercel/next.js", 96248, "Only advance the Turbopack HMR hash when compiled output actually changed", "performance", "manual-review"),
  pr("vercel/next.js", 96783, "Only announce server component changes when compiled output changed", "performance", "manual-review"),
  pr("vercel/next.js", 96235, "Fix use cache over- and under-invalidation in dev", "performance", "positive-candidate"),
  pr("vercel/next.js", 96726, "Discard only cache entries that predate a tag revalidation", "performance", "positive-candidate"),
  pr("vercel/next.js", 96727, "Reuse completed cache entries for the rest of a request", "performance", "positive-candidate"),
  pr("vercel/next.js", 96857, "turbo-tasks: explicit GC root anchoring + cross-session orphan reclamation", "performance", "manual-review"),
  pr("vercel/next.js", 95974, "turbo-tasks: add scope_unbounded, a scoped execution primitive that allows more work to be discovered", "performance", "manual-review"),

  // Next.js / RSC — 30
  pr("vercel/next.js", 94300, "errors: shorten use cache messages and unify them into one factory", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 97184, "Omit undeclared children slots from app routes", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96819, "Fix missing Pages runtime in adapter Pages API outputs", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96775, "Development: don't 404 routes whose files exist on disk", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96782, "Turbopack: replace the ensurePage wait deadline with a route probe", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96784, "Serve a new dev route as soon as Turbopack announces it", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96785, "Turbopack: derive the dev route matchers from the entrypoints", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96786, "Give route-shaped dev server strings distinct types", "nextjs-rsc", "negative-control"),
  pr("vercel/next.js", 96873, "Scope app entry export validation to the app directory", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96406, "Unify RouteTree and CacheNodeSeedData on the client", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96439, "Unify full/partial navigation response types", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 98292, "Turbopack: include pages/_app next/dynamic imports in each page loadable manifest", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96776, "Detect sibling root layouts when collecting root params", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 85320, "use server should error when used in pages dir", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96430, "fix(turbopack): register server actions in lazy dynamic imports", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 97029, "Keep App Route HMR generations coherent", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96670, "Remove cache revalidation execution mode reads", "nextjs-rsc", "negative-control"),
  pr("vercel/next.js", 96674, "Remove WorkStore execution mode", "nextjs-rsc", "negative-control"),
  pr("vercel/next.js", 92861, "[otel]: add spans for various cache components warmup phases", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96347, "feat(turbopack): defer dynamic import chunks in development", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 95976, "turbo-tasks-backend: parent_count reference counting", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96929, "turbo-persistence: add key-value tombstones for MultiValue families", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 96720, "Bump @swc/helpers", "nextjs-rsc", "negative-control"),
  pr("vercel/next.js", 96695, "Serialize prerender manifest updates in dev", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96639, "Turbopack: skip symlinks to directories when collecting traced includes", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96651, "fix: preserve repeated --require/--import flags when forking workers", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 93291, "[ci]: ensure latest tag is not stale", "nextjs-rsc", "manual-review"),
  pr("vercel/next.js", 97818, "fix(router-utils): remove res close listeners in proxyRequest finally block", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 90101, "fix: return 404 instead of 500 for multipart POST without server action", "nextjs-rsc", "positive-candidate"),
  pr("vercel/next.js", 96731, "Derive foreground cache revalidation from the consumer", "nextjs-rsc", "manual-review"),

  // Clean / false-positive controls — 15
  pr("TanStack/query", 11406, "docs(angular-query-experimental): add JSDoc across the package", "clean", "negative-control", "minimized", "tanstack-query-11406-angular-jsdoc"),
  pr("TanStack/query", 11407, "test(query-core): expand notifyManager unit tests", "clean", "negative-control", "minimized", "tanstack-query-11407-notify-manager-tests"),
  pr("TanStack/query", 11393, "test(query-core): expand TimeoutManager unit tests", "clean", "negative-control", "minimized", "tanstack-query-11393-timeout-manager-tests"),
  pr("vercel/next.js", 98291, "docs: add a section on measuring memory at runtime", "clean", "negative-control", "minimized", "vercel-next-98291-memory-docs"),
  pr("vercel/next.js", 96751, "docs: present each Skill as steps in the AI agents guide", "clean", "negative-control", "minimized", "vercel-next-96751-ai-agent-docs"),
  pr("vercel/next.js", 96723, "docs: update redirected links to current targets", "clean", "negative-control", "minimized", "vercel-next-96723-doc-link-updates"),
  pr("vercel/next.js", 75178, "Update README.md", "clean", "negative-control", "minimized", "vercel-next-75178-readme-link"),
  pr("vercel/next.js", 96871, "Lint devlow-bench with the root eslint config", "clean", "negative-control", "minimized", "vercel-next-96871-lint-refactor"),
  pr("vercel/next.js", 96772, "Consolidate Promise.withResolvers polyfills", "clean", "negative-control", "minimized", "vercel-next-96772-promise-resolvers-refactor"),
  pr("vercel/next.js", 97284, "introduce an options struct for constructing backend storage", "clean", "negative-control"),
  pr("TanStack/query", 11366, "docs(react-query): generate reference docs with TypeDoc", "clean", "negative-control", "minimized", "tanstack-query-11366-generated-reference-docs"),
  pr("TanStack/query", 11258, "test(query-core): align mutation test filenames with 'mutation.ts' by renaming and merging duplicate '.test-d' files", "clean", "negative-control", "minimized", "tanstack-query-11258-test-file-alignment"),
  pr("TanStack/query", 11369, "docs(solid-query): add JSDoc and generate reference docs with TypeDoc", "clean", "negative-control", "minimized", "tanstack-query-11369-solid-jsdoc-negative"),
  pr("TanStack/query", 11368, "chore(scripts/generate-docs): add solid-query entry point", "clean", "negative-control", "minimized", "tanstack-query-11368-solid-doc-generator-negative"),
  pr("TanStack/query", 11378, "docs(vue-query): add JSDoc and generate reference docs with TypeDoc", "clean", "negative-control", "minimized", "tanstack-query-11378-vue-jsdoc-negative"),
];

export function countRealWorldCatalogByCategory(
  category: RealWorldCatalogCategory,
): number {
  return REAL_WORLD_PR_CATALOG.filter((entry) => entry.category === category).length;
}

export function countRealWorldCatalogBySignal(
  signal: RealWorldCatalogSignal,
): number {
  return REAL_WORLD_PR_CATALOG.filter((entry) => entry.signal === signal).length;
}
