export type RealWorldFindingVerdict = "true-positive" | "false-positive" | "invalid-fixture";

export interface RealWorldFindingAdjudication {
  readonly caseId: string;
  readonly findingId: string;
  readonly verdict: RealWorldFindingVerdict;
  readonly expectationId?: string;
  readonly rationale: string;
  readonly provenance?: {
    readonly headSha: string;
    readonly sourceUrl: string;
    readonly fixtureAssessment: string;
  };
}

export const REAL_WORLD_FINDING_ADJUDICATIONS: readonly RealWorldFindingAdjudication[] = [
  {
    caseId: "vercel-next-86406-health-endpoint",
    findingId: "security.data.operational-response-exposure:evaluation%2Ffixtures%2Freal-world%2Fnext-health-endpoint.ts:658-695:secret-output",
    verdict: "true-positive",
    expectationId: "operational-data-exposure",
    rationale: "The rule identifies the adjudicated operational details exposed by the health response.",
  },
  {
    caseId: "vercel-next-96608-csp-segment-nonce",
    findingId: "security.xss.csp-nonce-propagation:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Fvercel-next-96608-csp-segment-nonce.ts:140-198:html-render",
    verdict: "true-positive",
    expectationId: "missing-segment-script-nonce",
    rationale: "The emitted script descriptor omits the nonce carried by the render context.",
  },
  {
    caseId: "vercel-next-97043-pages-csp-nonce",
    findingId: "security.xss.csp-nonce-propagation:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Fvercel-next-97043-pages-csp-nonce.ts:322-384:html-render",
    verdict: "true-positive",
    expectationId: "missing-streaming-nonce",
    rationale: "The streaming render options fail to forward the available CSP nonce.",
  },
  {
    caseId: "vercel-next-95182-edge-action-body-limit",
    findingId: "performance.backpressure.unbounded-queue:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Fvercel-next-95182-edge-action-body-limit.ts:279-297:none",
    verdict: "true-positive",
    expectationId: "unbounded-action-body",
    rationale: "Unbounded chunk accumulation is the adjudicated missing Edge request body limit.",
  },
  {
    caseId: "tanstack-query-11381-ssr-script-xss",
    findingId: "security.xss.raw-json-script-serialization:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Ftanstack-query-11381-ssr-script-xss.ts:72-145:html-render",
    verdict: "true-positive",
    expectationId: "unsafe-inline-state-serialization",
    rationale: "Raw JSON is interpolated into an executable script element without HTML-safe escaping.",
  },
  {
    caseId: "vercel-next-98152-loading-template-csp-nonce",
    findingId: "security.xss.csp-nonce-propagation:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Fvercel-next-98152-loading-template-csp-nonce.ts:141-200:html-render",
    verdict: "true-positive",
    expectationId: "missing-boundary-script-nonce",
    rationale: "The boundary script descriptor omits the nonce carried by its render context.",
  },
  {
    caseId: "vercel-next-96580-env-fifo-reload",
    findingId: "security.configuration.destructive-env-reload:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Fvercel-next-96580-env-fifo-reload.ts:237-266:unknown",
    verdict: "true-positive",
    expectationId: "destructive-env-reload",
    rationale: "The environment is replaced before the replacement dotenv files are successfully read.",
  },
  {
    caseId: "tanstack-query-11270-null-hydration",
    findingId: "quality.correctness.nullable-hydration-state:evaluation/fixtures/real-world/virtual/tanstack-query-11270-null-hydration.ts:6:9",
    verdict: "true-positive",
    expectationId: "unguarded-hydration-state",
    rationale: "The nullable hydration state is dereferenced before a guard.",
  },
  {
    caseId: "vercel-next-93154-search-param-cache-collision",
    findingId: "quality.correctness.search-param-multivalue-key:evaluation/fixtures/real-world/virtual/vercel-next-93154-search-param-cache-collision.ts:2:16",
    verdict: "true-positive",
    expectationId: "multi-value-search-param-collision",
    rationale: "Object.fromEntries collapses repeated search parameters used by the cache key.",
  },
  {
    caseId: "tanstack-query-10079-query-promise-reset",
    findingId: "react.hooks.stale-promise-ref:evaluation/fixtures/real-world/virtual/tanstack-query-10079-query-promise-reset.tsx:12:2",
    verdict: "true-positive",
    expectationId: "stale-query-promise",
    rationale: "The exposed promise ref can remain stale while a retry replaces the active promise.",
  },
  {
    caseId: "tanstack-query-11385-mount-subscription-race",
    findingId: "react.hooks.external-subscription-gap:evaluation/fixtures/real-world/virtual/tanstack-query-11385-mount-subscription-race.tsx:11:2",
    verdict: "true-positive",
    expectationId: "mount-subscription-gap",
    rationale: "The passive subscription does not reconcile changes after the render-time snapshot.",
  },
  {
    caseId: "tanstack-query-10006-devtools-isolation",
    findingId: "react.state.module-shared-instance-state:evaluation/fixtures/real-world/virtual/tanstack-query-10006-devtools-isolation.tsx:5:7:sharedSelectedQueryId",
    verdict: "true-positive",
    expectationId: "cross-instance-state-leak",
    rationale: "Mutable module state backs component-owned state across mounted instances.",
  },
  {
    caseId: "vercel-next-96252-pre-hydration-navigation-race",
    findingId: "react.hooks.browser-subscription-gap:evaluation/fixtures/real-world/virtual/vercel-next-96252-pre-hydration-navigation-race.tsx:6:2",
    verdict: "true-positive",
    expectationId: "missed-pre-hydration-traversal",
    rationale: "The passive browser listener does not reconcile navigation before hydration.",
  },
  {
    caseId: "tanstack-query-11326-solid-query-ssr-teardown",
    findingId: "quality.resource.server-cache-teardown:evaluation/fixtures/real-world/virtual/tanstack-query-11326-solid-query-ssr-teardown.ts:13:2",
    verdict: "true-positive",
    expectationId: "missing-server-query-cache-teardown",
    rationale: "Server disposal leaves pending queries and per-request cache state alive.",
  },
  {
    caseId: "tanstack-query-11395-dehydration-timestamp",
    findingId: "quality.correctness.nondeterministic-snapshot-time:evaluation/fixtures/real-world/virtual/tanstack-query-11395-dehydration-timestamp.ts:7:18",
    verdict: "true-positive",
    expectationId: "non-deterministic-dehydration-time",
    rationale: "Snapshot serialization reads wall-clock time inside the cached computation.",
  },
  {
    caseId: "vercel-next-83200-manifest-streaming-head",
    findingId: "quality.web.manifest-streamed-body:evaluation/fixtures/real-world/virtual/vercel-next-83200-manifest-streaming-head.ts:10:8",
    verdict: "true-positive",
    expectationId: "manifest-emitted-in-streamed-body",
    rationale: "The manifest link is emitted through streamed body metadata instead of the document head.",
  },
  {
    caseId: "vercel-next-91586-noop-tracer-force-context",
    findingId: "quality.correctness.undefined-method-guard:evaluation/fixtures/real-world/virtual/vercel-next-91586-noop-tracer-force-context.ts:10:9",
    verdict: "true-positive",
    expectationId: "undefined-force-guard",
    rationale: "The method guard references an identifier unavailable in its scope.",
  },
  {
    caseId: "vercel-next-91593-component-tree-negative",
    findingId: "performance.async.unbounded-promise-all:evaluation%2Ffixtures%2Freal-world%2Fnext-component-tree-negative.tsx:749-784:none",
    verdict: "false-positive",
    rationale: "The fan-out covers the finite parallel-route slots already defined by the route tree; the reviewed optimization intentionally preserves this parallel work.",
  },
  {
    caseId: "vercel-next-91593-component-tree-negative",
    findingId: "performance.backpressure.missing-concurrency-limit:evaluation%2Ffixtures%2Freal-world%2Fnext-component-tree-negative.tsx:749-784:none",
    verdict: "false-positive",
    rationale: "The route-slot collection is configuration-bounded and processed in parallel by design, with no evidence of producer pressure or an unbounded external input.",
  },
  {
    caseId: "vercel-next-86408-config-loader",
    findingId: "performance.cache.missing-ttl:evaluation%2Ffixtures%2Freal-world%2Fnext-config-loader.ts:573-598:none",
    verdict: "false-positive",
    rationale: "Page extensions are immutable configuration for the lint process lifetime, so time-based expiration would invalidate the intended cache semantics.",
  },
  {
    caseId: "vercel-next-86408-config-loader",
    findingId: "performance.cache.unbounded:evaluation%2Ffixtures%2Freal-world%2Fnext-config-loader.ts:573-598:none",
    verdict: "false-positive",
    rationale: "The cache key space is the finite set of project roots handled by the process, not request-controlled data; per-root keying is the reviewed correctness fix.",
  },
  {
    caseId: "vercel-next-86408-config-loader",
    findingId: "performance.memory.unbounded-cache:evaluation%2Ffixtures%2Freal-world%2Fnext-config-loader.ts:135-171:none",
    verdict: "false-positive",
    rationale: "The module cache retains static configuration for a bounded lint invocation and has no demonstrated long-lived growth path.",
  },
  {
    caseId: "vercel-next-86408-config-loader",
    findingId: "performance.memory.unbounded-map-set:evaluation%2Ffixtures%2Freal-world%2Fnext-config-loader.ts:135-171:none",
    verdict: "false-positive",
    rationale: "The map is intentionally scoped to distinct project roots seen by one tooling process; the finding supplies no actionable growth evidence.",
  },
  {
    caseId: "vercel-next-95182-edge-action-body-limit",
    findingId: "performance.async.serial-await:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Fvercel-next-95182-edge-action-body-limit.ts:225-244:none",
    verdict: "false-positive",
    rationale: "ReadableStream chunks must be consumed in order; parallelizing reader.read calls is not a valid optimization for this stream protocol.",
  },
  {
    caseId: "vercel-next-95182-edge-action-body-limit",
    findingId: "performance.backpressure.unbounded-producer:evaluation%2Ffixtures%2Freal-world%2Fvirtual%2Fvercel-next-95182-edge-action-body-limit.ts:279-297:none",
    verdict: "true-positive",
    expectationId: "unbounded-action-body",
    rationale: "The repeated stream producer has no body-size bound, independently describing the same actionable resource-exhaustion defect as the adjudicated expectation.",
  },
  {
    caseId: "tanstack-query-10079-query-promise-reset",
    findingId: "react.hooks.missing-deps:evaluation/fixtures/real-world/virtual/tanstack-query-10079-query-promise-reset.tsx:12:2",
    verdict: "true-positive",
    expectationId: "stale-query-promise",
    rationale: "The effect reads result.promise but depends only on result.status, so a promise replacement without a status change leaves the exposed ref stale.",
  },
  {
    caseId: "tanstack-query-11385-mount-subscription-race",
    findingId: "react.hooks.missing-deps:evaluation/fixtures/real-world/virtual/tanstack-query-11385-mount-subscription-race.tsx:11:2",
    verdict: "false-positive",
    rationale: "The cache object is already the dependency and the state setter is stable; listing cache.subscribe and setValue separately does not fix the subscription gap.",
  },
  {
    caseId: "tanstack-query-10006-devtools-isolation",
    findingId: "react.hooks.invalid-order:evaluation/fixtures/real-world/virtual/tanstack-query-10006-devtools-isolation.tsx:6:48",
    verdict: "false-positive",
    rationale: "DevtoolsInstance is an uppercase React component and useState is called unconditionally at its top level, so the Hook placement is valid.",
  },
  {
    caseId: "vercel-next-96252-pre-hydration-navigation-race",
    findingId: "react.hooks.missing-deps:evaluation/fixtures/real-world/virtual/vercel-next-96252-pre-hydration-navigation-race.tsx:6:2",
    verdict: "false-positive",
    rationale: "The state setter is stable and window APIs are global mutable sources rather than reactive dependencies; adding them would not reconcile the hydration gap.",
  },
  {
    caseId: "vercel-next-96245-hmr-digest-serialization",
    findingId: "performance.async.serial-await:packages%2Fnext%2Fsrc%2Fserver%2Fdev%2Fhot-reloader-turbopack.ts:432-478:none",
    verdict: "invalid-fixture",
    rationale: "The pinned change introduces the digest await to compare successive outputs before advancing hmrHash; iterations depend on previous digest state. The fixture's performance expectation is contradicted by this correctness change.",
    provenance: {
      headSha: "db4e628203b930b66c6986cf7ac2151fddcee38f",
      sourceUrl: "https://raw.githubusercontent.com/vercel/next.js/db4e628203b930b66c6986cf7ac2151fddcee38f/packages/next/src/server/dev/hot-reloader-turbopack.ts",
      fixtureAssessment: "The minimized fixture labels intended content-digest correctness work as an expensive pre-fix HMR serialization bug and removes the prior-digest state transition and incremental write semantics.",
    },
  },
  {
    caseId: "vercel-next-96245-hmr-digest-serialization",
    findingId: "performance.async.serial-await:packages%2Fnext%2Fsrc%2Fserver%2Fdev%2Fhot-reloader-turbopack.ts:484-530:none",
    verdict: "invalid-fixture",
    rationale: "The pinned getServerContentDigest performs writeToDisk internally and documents incremental memoization. The fixture invents a separate persistence await and omits these semantics, so its second serial-await finding has no faithful upstream counterpart.",
    provenance: {
      headSha: "db4e628203b930b66c6986cf7ac2151fddcee38f",
      sourceUrl: "https://raw.githubusercontent.com/vercel/next.js/db4e628203b930b66c6986cf7ac2151fddcee38f/packages/next/src/server/dev/hot-reloader-turbopack.ts",
      fixtureAssessment: "The minimized fixture labels intended content-digest correctness work as an expensive pre-fix HMR serialization bug and removes the prior-digest state transition and incremental write semantics.",
    },
  },
  {
    caseId: "vercel-next-97184-app-loader-cache-hit-dependency",
    findingId: "performance.cache.missing-ttl:packages%2Fnext%2Fsrc%2Fbuild%2Fwebpack%2Floaders%2Fnext-app-loader%2Findex.ts:387-427:none",
    verdict: "invalid-fixture",
    rationale: "Upstream directory scan results are scoped to a compilation, whose lifecycle supplies expiration. The minimized module Map loses this scope; a TTL requirement cannot be adjudicated from the altered fixture.",
    provenance: {
      headSha: "581a78cbc30a1c8731fb65d768986f094cac103c",
      sourceUrl: "https://raw.githubusercontent.com/vercel/next.js/581a78cbc30a1c8731fb65d768986f094cac103c/packages/next/src/build/webpack/loaders/next-app-loader/index.ts",
      fixtureAssessment: "The minimization replaces WeakMap<Compilation, Map<directory, Promise<boolean>>> with a persistent module Map and deterministic synthetic tree strings, losing compilation lifetime and directory-scan semantics. Pinned head already registers context dependencies before cache reads.",
    },
  },
  {
    caseId: "vercel-next-97184-app-loader-cache-hit-dependency",
    findingId: "performance.cache.unbounded:packages%2Fnext%2Fsrc%2Fbuild%2Fwebpack%2Floaders%2Fnext-app-loader%2Findex.ts:387-427:none",
    verdict: "invalid-fixture",
    rationale: "Upstream scans traverse the compilation's filesystem route directories with WeakMap ownership, rather than arbitrary appDirectory keys retained globally. The minimization creates the growth concern being reported.",
    provenance: {
      headSha: "581a78cbc30a1c8731fb65d768986f094cac103c",
      sourceUrl: "https://raw.githubusercontent.com/vercel/next.js/581a78cbc30a1c8731fb65d768986f094cac103c/packages/next/src/build/webpack/loaders/next-app-loader/index.ts",
      fixtureAssessment: "The minimization replaces WeakMap<Compilation, Map<directory, Promise<boolean>>> with a persistent module Map and deterministic synthetic tree strings, losing compilation lifetime and directory-scan semantics. Pinned head already registers context dependencies before cache reads.",
    },
  },
  {
    caseId: "vercel-next-97184-app-loader-cache-hit-dependency",
    findingId: "performance.memory.unbounded-cache:packages%2Fnext%2Fsrc%2Fbuild%2Fwebpack%2Floaders%2Fnext-app-loader%2Findex.ts:98-123:none",
    verdict: "invalid-fixture",
    rationale: "The persistent module cache is an artifact of the fixture. Pinned source uses a weak compilation key, allowing scan maps to be collected after their owner disappears.",
    provenance: {
      headSha: "581a78cbc30a1c8731fb65d768986f094cac103c",
      sourceUrl: "https://raw.githubusercontent.com/vercel/next.js/581a78cbc30a1c8731fb65d768986f094cac103c/packages/next/src/build/webpack/loaders/next-app-loader/index.ts",
      fixtureAssessment: "The minimization replaces WeakMap<Compilation, Map<directory, Promise<boolean>>> with a persistent module Map and deterministic synthetic tree strings, losing compilation lifetime and directory-scan semantics. Pinned head already registers context dependencies before cache reads.",
    },
  },
  {
    caseId: "vercel-next-97184-app-loader-cache-hit-dependency",
    findingId: "performance.memory.unbounded-map-set:packages%2Fnext%2Fsrc%2Fbuild%2Fwebpack%2Floaders%2Fnext-app-loader%2Findex.ts:98-123:none",
    verdict: "invalid-fixture",
    rationale: "The fixture removes weak compilation ownership and finite directory traversal, so this persistent collection claim cannot establish an empirical upstream defect.",
    provenance: {
      headSha: "581a78cbc30a1c8731fb65d768986f094cac103c",
      sourceUrl: "https://raw.githubusercontent.com/vercel/next.js/581a78cbc30a1c8731fb65d768986f094cac103c/packages/next/src/build/webpack/loaders/next-app-loader/index.ts",
      fixtureAssessment: "The minimization replaces WeakMap<Compilation, Map<directory, Promise<boolean>>> with a persistent module Map and deterministic synthetic tree strings, losing compilation lifetime and directory-scan semantics. Pinned head already registers context dependencies before cache reads.",
    },
  },
  {
    caseId: "vercel-next-96727-request-cache-completed-entry",
    findingId: "performance.cache.missing-ttl:packages%2Fnext%2Fsrc%2Fserver%2Fuse-cache%2Fhandlers.ts:271-301:none",
    verdict: "false-positive",
    rationale: "pendingFills deletes entries when their promises settle. The upstream defect is deleting completed entries too early within the request, not lacking time-based expiration; adding a TTL does not repair sequential request deduplication.",
    provenance: {
      headSha: "047556e8cdd0f51f23dbe0393fd8ffd98bc8a0da",
      sourceUrl: "https://github.com/vercel/next.js/commit/047556e8cdd0f51f23dbe0393fd8ffd98bc8a0da",
      fixtureAssessment: "The fixture preserves settlement-time eviction for the assessed missing-TTL claim; request ownership is absent from the reduced module and must be restored before evaluating cross-request retention claims.",
    },
  },
];

export function findRealWorldFindingAdjudication(
  caseId: string,
  findingId: string,
): RealWorldFindingAdjudication | undefined {
  return REAL_WORLD_FINDING_ADJUDICATIONS.find(
    (adjudication) =>
      adjudication.caseId === caseId && adjudication.findingId === findingId,
  );
}
