# Phase 8 — Modern React & Next.js Review Intelligence

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: 🚧 Engineering mechanisms complete; empirical qualification pending

Prerequisites:

- Phase 3.4 React/RSC intelligence remains the compatibility baseline.
- Phase 7 evaluation, evidence, regression, and promotion mechanisms are reused for qualification.
- The repository remains a React/Vite product. Next.js is an analysis target only; this phase must not migrate the application to Next.js or add a Next.js runtime dependency without separate authorization.

---

## Objective

Upgrade framework-aware review from local React/Next.js pattern detection into version-aware semantic review that understands modern React execution semantics and Next.js App Router behavior.

The target is not to maximize rule count. The target is to detect high-value correctness, security, performance, cache-lifecycle, routing, and server/client-boundary defects with production-grade precision.

Phase 8 should move the reviewer from:

```text
syntax/pattern -> warning
```

toward:

```text
project/framework capabilities
        +
semantic model
        +
repository context
        +
deterministic evidence
        ↓
verified framework finding
```

AI may explain, prioritize, or propose hypotheses, but deterministic analysis remains authoritative whenever a claim is mechanically verifiable.

---

## Current Baseline

The repository already provides:

- a framework-agnostic built-in React plugin
- an opt-in Next.js plugin
- App Router boundary checks
- React Server Component boundary modeling
- deterministic hooks, rendering, state, context, and performance rules
- repository/project profile infrastructure
- security and performance analyzers
- Phase 7 evidence, verification, evaluation, and promotion mechanisms

The current application dependency baseline uses React 19.2.x. The Phase 8 analyzer target should cover React 18 compatibility and modern React 19.x semantics, including React 19.3 features where they materially affect review correctness.

For Next.js, the primary target is the modern 16.x App Router programming model while retaining compatibility coverage for supported 15.x projects where practical. Framework support must be capability-driven rather than hard-coded to one release string.

External framework references at plan creation time:

- React 19.3 release: https://react.dev/blog/2026/09/09/react-19-3
- Next.js releases/docs: https://nextjs.org/blog
- Next.js App Router docs: https://nextjs.org/docs/app

These links are references, not substitutes for tests or repository source-of-truth rules.

---

## Core Principles

1. **Framework capability before framework rule.** Rules must know whether the relevant React/Next.js feature exists and is enabled.
2. **React core stays framework-agnostic.** Next.js-specific semantics remain behind the optional Next.js plugin.
3. **No path-only framework inference.** Paths may be evidence, but framework detection should combine package/config/source context.
4. **Version-aware without version brittleness.** Prefer capability flags over long chains of version comparisons.
5. **Deterministic before AI.** AI must not guess router mode, compiler state, runtime, or framework capability when repository evidence can establish it.
6. **Repository context matters.** App Router, cache, Server Actions, and runtime findings frequently require cross-file or project-level evidence.
7. **Security entry points are server entry points.** Server Actions and Route Handlers are analyzed as externally reachable mutation/request surfaces.
8. **Performance findings require execution-model evidence.** Avoid generic memoization or async warnings without compiler/router/cache context.
9. **Evaluation precedes promotion.** New rules may ship as experimental/advisory before they qualify for blocking behavior.
10. **One review pipeline.** CLI, GitHub, CI, plugins, evaluation, and future APIs consume the same framework findings.

---

## Target Architecture

```text
Repository / PR
      │
      ▼
Project Profile + Package/Config Evidence
      │
      ▼
Framework Capability Resolver
      │
      ├── React version/features
      ├── React Compiler state
      ├── Next.js presence/version
      ├── App / Pages / mixed router
      ├── Cache Components capability
      └── Node / Edge / mixed runtime
      │
      ▼
React Semantic Model
      │
      ├── React 19 rules
      ├── Compiler-aware rules
      └── RSC rules
      │
      └──────────────► Optional Next.js Plugin
                         ├── App Router semantics
                         ├── Cache/data lifecycle
                         ├── Server Actions
                         ├── Navigation/streaming
                         ├── Runtime/deployment
                         └── Next-specific security
      │
      ▼
Evidence / Verification / Calibration
      │
      ▼
Review Finding / Decision
```

Recommended source shape:

```text
src/react/
  semantic/
    framework-context.ts
    compiler.ts

  rules/
    react19/
    compiler/
    rsc/

  plugins/
    nextjs/
      index.ts
      semantic/
        project.ts
        router.ts
        route-segment.ts
        cache.ts
        action.ts
        runtime.ts
      rules/
        app-router/
        cache/
        actions/
        navigation/
        runtime/
        security/
```

This is a target shape, not authorization for a big-bang refactor. Reuse current boundaries and move incrementally only where implementation requires it.

---

# Roadmap

## 8.1 — Framework Detection & Capability Model v2

Status: ✅ Complete

Objective: establish reliable framework context once and inject it into framework-aware rules.

Scope:

- detect React from package/project evidence
- resolve React major/minor capabilities where available
- detect Next.js from dependencies/config/source evidence
- distinguish `app`, `pages`, `mixed`, and `unknown` router modes
- recognize conventional `app/` and `src/app/` layouts without relying on paths alone
- expose React Compiler state as `enabled`, `disabled`, or `unknown`
- expose Cache Components capability/config state where deterministically knowable
- model Node, Edge, mixed, and unknown runtime evidence
- make capability resolution reusable by evaluation and AI context construction

Suggested contract:

```ts
interface FrameworkContext {
  react: {
    detected: boolean;
    version?: string;
    compiler: "enabled" | "disabled" | "unknown";
  };
  nextjs?: {
    version?: string;
    router: "app" | "pages" | "mixed" | "unknown";
    cacheComponents: boolean | "unknown";
    runtime: "node" | "edge" | "mixed" | "unknown";
  };
}
```

Acceptance criteria:

- no existing React-only project is classified as Next.js solely because a path contains `app`
- `app/`, `src/app/`, Pages Router, and mixed-router fixtures are covered
- missing package/config context degrades to `unknown` rather than fabricated certainty
- framework context is deterministic for identical repository input

Implemented:

- Added deterministic `FrameworkContext` resolution in `src/react/semantic/framework-context.ts`.
- React/Next.js dependency and config evidence now drive React detection, Next.js detection, router mode, React Compiler state, Cache Components state, and route runtime mode.
- Next.js App Router rules now require established framework context in addition to an App Router path.
- Added regression coverage for React-only `app/` paths, `app/`, `src/app/`, Pages Router, mixed router, missing evidence, compiler config, cacheComponents, and Node/Edge runtime evidence.

---

## 8.2 — React 19.x Intelligence

Status: ✅ Complete

Objective: cover modern React semantics that materially change correctness or review guidance.

Priority areas:

- `useEffectEvent` misuse and dependency-avoidance anti-patterns
- `<Activity>` lifecycle/effect assumptions
- `<ViewTransition>` semantic misuse where statically provable
- Fragment refs where DOM/ref assumptions can be validated
- `use(...)` and Suspense boundary interactions
- Actions / form action-state patterns
- React 19.3 `browser()` SSR opt-out semantics where relevant
- stale legacy patterns whose advice changed in React 19

Constraints:

- do not warn merely because a new API is unfamiliar
- version/capability gates must prevent advice that is invalid for older React projects
- experimental/stable distinctions must come from framework context, not model memory

Acceptance criteria:

- positive and negative fixtures for every rule
- React 18 compatibility fixtures remain green
- no rule assumes all React 19 projects use Server Components

---

## 8.3 — React Compiler-Aware Review

Status: ✅ Complete

Objective: prevent performance review from giving obsolete manual-memoization advice when React Compiler is active, while detecting code patterns that materially defeat or conflict with compiler assumptions.

Scope:

- compiler configuration detection
- unnecessary/manual memoization findings only when evidence supports them
- mutation/escape patterns that prevent expected optimization where mechanically provable
- compatibility with existing `useMemo`, `useCallback`, and render-performance rules
- suppression/downgrade of recommendations that become redundant under compiler optimization

Acceptance criteria:

- identical source may receive different advisory output only when compiler context legitimately differs
- no blanket "remove useMemo/useCallback" rule
- existing performance rules remain deterministic and explain why compiler context affected the finding

---

## 8.4 — Next.js App Router Intelligence v2

Status: ✅ Complete

Objective: reason about App Router file roles and route-segment semantics rather than isolated files only.

Scope:

- `layout`, `page`, `template`, `loading`, `error`, `not-found`, and `route` semantics
- Server/Client boundary placement
- unnecessary high-level `"use client"` boundaries
- metadata/export restrictions where statically knowable
- request/dynamic API usage
- Route Handler method/runtime semantics
- cross-file route segment evidence

Candidate finding families:

```text
next.app.invalid-special-file-export
next.app.client-layout-overreach
next.app.unnecessary-client-boundary
next.app.invalid-metadata-client-component
next.app.route-handler-runtime-conflict
next.app.dynamic-api-boundary
```

Acceptance criteria:

- rules require established Next.js App Router context
- custom components/ordinary files are not treated as route-special files by filename coincidence outside route context
- existing Phase 3.4.9 rules remain behavior-compatible unless an explicit migration is documented

---

## 8.5 — Cache Components & Data Lifecycle Intelligence

Status: ✅ Complete

Objective: analyze cache scope, mutation, and invalidation as a lifecycle rather than isolated API calls.

Scope:

- `use cache` boundaries and cache scope
- tag relationships where statically resolvable
- `cacheTag`, `revalidateTag`, `updateTag`, and `refresh` usage
- request/user-specific data crossing cache boundaries
- mutation followed by missing or inconsistent invalidation
- over-broad cache scope and cache-key evidence
- cache behavior interaction with route/component boundaries

Target reasoning model:

```text
data source
   ↓
cache boundary / key / tag
   ↓
consumer
   ↓
mutation
   ↓
invalidation / refresh
```

Candidate finding families:

```text
next.cache.mutation-without-invalidation
next.cache.request-data-inside-cache
next.cache.user-specific-data-leak-risk
next.cache.tag-never-invalidated
next.cache.overbroad-scope
```

High-severity cache leakage findings require cross-file evidence strong enough to establish that user/request-specific data can actually be shared.

---

## 8.6 — Server Actions & Mutation Security

Status: ✅ Complete

Objective: analyze Server Actions as server-side entry points that require the same trust-boundary discipline as API handlers.

Target flow:

```text
Client input
   ↓
Server Action
   ↓
Authentication
   ↓
Authorization
   ↓
Validation
   ↓
Mutation
   ↓
Cache invalidation / redirect / response
```

Scope:

- missing/insufficient authorization evidence on sensitive mutations
- trusting client-provided ownership/user identifiers
- unvalidated `FormData`/input usage when a dangerous sink is established
- mass-assignment-like object forwarding where mechanically supported
- secret/sensitive data returned across the server/client boundary
- missing cache invalidation after a mutation when dependency evidence is available
- serializability compatibility with existing RSC rules

Constraints:

- authentication/authorization findings must not be based only on naming conventions
- reuse security analyzer primitives instead of implementing a second security engine
- advisory output is preferred when repository context is incomplete

---

## 8.7 — Routing, Streaming & Navigation Performance

Status: ✅ Complete

Objective: detect regressions that make modern App Router navigation block unnecessarily or create avoidable waterfalls.

Scope:

- blocking root/segment fetches
- missing useful Suspense boundaries when deterministically inferable
- sequential async waterfalls with independent operations
- unnecessary client-side fetching when equivalent server data is already available
- prefetch-hostile patterns where framework evidence supports the claim
- Instant Navigation readiness signals for compatible Next.js versions

Candidate finding families:

```text
next.navigation.blocking-root-fetch
next.navigation.async-waterfall
next.navigation.missing-suspense-boundary
next.navigation.unnecessary-client-fetch
```

Performance findings must explain the execution dependency that creates blocking behavior; syntax alone is insufficient.

---

## 8.8 — Runtime & Deployment Correctness

Status: ✅ Complete

Objective: catch code that is valid TypeScript/React but incompatible with the selected Next.js runtime or deployment boundary.

Scope:

- Node-only API use in Edge-constrained code
- runtime declarations inconsistent with imported dependencies
- environment-variable exposure across server/client boundaries
- middleware/proxy/runtime compatibility where supported by the detected framework version
- server-only package leakage into client bundles

Acceptance criteria:

- runtime findings include concrete import/API evidence
- unknown deployment targets do not produce high-confidence incompatibility findings

---

## 8.9 — Framework Evaluation Corpus & Qualification

Status: 🚧 Synthetic qualification complete; verified-source evidence pending

Objective: establish whether Phase 8 rules are trustworthy across framework versions and repository shapes.

Required fixture dimensions:

- React 18 and React 19.x
- React Compiler enabled/disabled/unknown
- Next.js 15.x and 16.x where supported by the rule
- App Router, Pages Router, and mixed router
- `app/` and `src/app/`
- Node and Edge runtime cases
- positive defects and empirical negative controls
- multi-file cache/action/navigation cases

Initial quality targets:

| Metric | Target |
| --- | ---: |
| Deterministic repeatability | 100% |
| Rule crash rate on supported fixtures | 0% |
| High-severity precision | >= 98% before blocking eligibility |
| Overall actionable precision | >= 95% before default-on promotion |
| Protected framework false-positive regressions | 0 |
| Version-gating regressions | 0 |

Targets are qualification goals, not guarantees. If the corpus is too small, reports must say `insufficient evidence` and the rule remains experimental/advisory.

Current qualification evidence:

- `npm run evaluation:phase8-report` executes eight synthetic matrix cases through the production pipeline.
- Deterministic repeatability is 100%, rule crash rate is 0%, and protected/version-gating regressions are 0.
- The report status is `insufficient-evidence`; every new Phase 8 rule remains advisory pending a sufficiently large verified-source cohort.

---

## 8.10 — Framework Context for AI Review

Status: ✅ Complete

Objective: let AI reason with verified framework facts without making framework detection itself probabilistic.

AI context may include:

- React version/capabilities
- compiler state
- Next.js version/router mode
- route-segment role
- RSC boundary facts
- cache/action/runtime evidence
- deterministic findings and contradictions

Constraints:

- AI cannot upgrade `unknown` framework facts into certainty without new repository evidence
- AI output that contradicts deterministic framework evidence is downgraded or rejected by the existing verification pipeline
- context selection remains bounded

---

## 8.11 — Hardening, Presets & Release

Status: ✅ Complete for advisory rollout

Objective: consolidate Phase 8 into maintainable framework support with explicit compatibility and rollout contracts.

The advisory release contract, compatibility matrix, finding codes, and qualification command are documented in `docs/review-intelligence.md`. Promotion to qualified/blocking behavior remains intentionally incomplete until Phase 8.9 has verified-source evidence.

Scope:

- rule documentation and stable finding codes
- compatibility matrix
- rule presets such as React-only, Next.js advisory, and qualified Next.js production profiles
- migration notes from Phase 3.4.9/3.4.10 behavior
- benchmark/runtime budgets
- final regression suite
- evaluation receipts and promotion status

Exit criteria:

- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes
- `npm run build` passes
- framework evaluation report identifies qualified vs advisory-only rules
- no default-on high-severity rule lacks sufficient deterministic evidence and empirical qualification
- Next.js remains opt-in/framework-gated; ordinary React projects do not inherit Next.js assumptions

---

## Dependency / Execution Order

Recommended order:

```text
8.1
 ↓
8.2 → 8.3
 ↓
8.4
 ↓
8.5 → 8.6
 ↓
8.9 qualification checkpoint
 ↓
8.7 → 8.8
 ↓
8.10
 ↓
8.11
```

8.9 is intentionally not left until the end. After the core React/App Router/cache/action rules exist, quality must be measured before expanding the default rule surface.

---

## Implementation Loop

For each sub-phase:

1. read this plan and the existing implementation it extends
2. inspect current repository behavior before defining new abstractions
3. implement the smallest reusable semantic primitive needed
4. add positive, negative, and version/capability fixtures
5. run typecheck, lint, tests, and build
6. run relevant Phase 7 evaluation/regression gates
7. document emitted finding codes and evidence requirements
8. keep the rule advisory/experimental if qualification evidence is insufficient
9. update this plan's status only after the implementation and validation evidence exist

---

## Non-Goals

Phase 8 does not authorize:

- migrating this repository from Vite to Next.js
- adding Next.js simply to test analyzer behavior when fixtures can model the target source
- replacing deterministic analysis with LLM-only framework review
- assuming every React project uses RSC, React Compiler, or Next.js
- implementing a second review pipeline for Next.js
- enabling blocking findings solely because a rule has unit tests
- broad framework rewrites unrelated to measured React/Next.js review quality

---

## Definition of Done

Phase 8 is complete when the reviewer can establish framework capabilities, reason about modern React and Next.js execution boundaries, detect qualified high-value defects across representative projects, and route those findings through the existing evidence/evaluation/promotion system without increasing false positives for ordinary React repositories.
