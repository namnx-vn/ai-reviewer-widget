# Real-World Public PR Corpus

This corpus uses public pull requests to measure reviewer usefulness and false-positive pressure without making CI depend on GitHub or external repositories.

## 100-PR catalog

`src/evaluation/real-world-catalog.ts` contains exactly 100 unique public PR references with the following fixed quota:

| Category | PRs | Primary purpose |
| --- | ---: | --- |
| Security | 20 | Security and trust-boundary review candidates |
| React / hooks / reactive lifecycle | 15 | Hook, hydration, state, context, and reactive correctness |
| Performance | 20 | Performance findings plus intentional optimization noise controls |
| Next.js / RSC | 30 | App Router, RSC, Server Actions, caching, routing, and runtime behavior |
| Clean | 15 | Docs, tests, lint, and behavior-preserving changes used as false-positive controls |
| **Total** | **100** | |

Catalog entries use three conservative signals:

- `positive-candidate`: the public PR describes a bug, security issue, or behavior worth checking, but it is not counted as a detected true positive until manually verified against an executable fixture.
- `negative-control`: the reviewer should not invent blocking production findings for the change.
- `manual-review`: useful real-world review material whose expected outcome still needs human classification.

The catalog is a **selection and labeling backlog**. Maturity is separate from the signal: only `minimized` entries have an executable offline fixture.

## Executable minimized corpus

The executable corpus contains **50 manually reviewed public PR cases**. Every case runs offline through the shared production `ReviewUseCases.reviewFiles` path.

| Group | Executable PRs |
| --- | ---: |
| Security / trust boundary | 20 |
| React / hooks / reactive lifecycle | 15 |
| Performance negative control | 1 |
| Clean false-positive controls | 14 |
| **Total** | **50** |

Current human expectation labels:

| Label | Expectations |
| --- | ---: |
| `must-find` | 17 |
| `must-not-find` | 31 |
| `advisory` | 5 |
| **Total** | **53** |

The original three standalone minimized fixtures remain under `evaluation/fixtures/real-world/`. Promoted cases are stored in six small offline fixture bundles covering Batch 1 and Batch 2 for security, React/reactive, and clean controls.

Each bundled entry receives a case-specific `.ts` or `.tsx` analysis path. Empirical controls retain the original-like upstream test path where path context affects production policy behavior. Bundle loading fails closed when a bundle is malformed or a fixture key is missing.

Each minimized case preserves repository, PR number, canonical URL, exact head SHA, human expectation, and catalog `fixtureId` linkage.

## Executable label semantics

- `must-find`: a human-reviewed issue that the reviewer should detect reliably.
- `must-not-find`: a known-safe behavior used to measure false-positive pressure.
- `advisory`: a legitimate review consideration that should not become a blocking finding without stronger evidence.

Labels are not automatically counted as achieved precision or recall. `src/evaluation/real-world-rule-mapping.ts` records only human-reviewed mappings from a `must-find` expectation to acceptable production `ruleId` values. A mapping is added only after the production observation emits a semantically matching rule on the minimized fixture.

## Current observation baseline

The latest rule-only 50-case CI observation is deterministic across all cases and reports:

- 50 / 50 stable cases
- 29 production findings emitted across the corpus
- 17 `must-find` expectations with semantically matching production findings available for exact mapping
- 5 empirical negative controls
- 0 / 5 empirical negative controls with findings
- 0 empirical negative-control findings at medium severity or higher
- 14 clean controls
- 0 / 14 clean controls with findings

The five empirical negative controls consist of three Query Core clean test PRs plus two Vue Query test-only PRs, all analyzed with upstream-like `__tests__/*.test.ts(x)` paths.

## Verified production-rule mappings

All **17 of 17 `must-find` expectations** now have exact production-rule mappings. Every mapping was added only after the corresponding production rule was observed on the executable minimized case.

| Public PR expectation | Production rule |
| --- | --- |
| `vercel/next.js#86406` operational health details | `security.data.operational-response-exposure` |
| `vercel/next.js#96608` missing segment-script nonce | `security.xss.csp-nonce-propagation` |
| `vercel/next.js#97043` missing Pages streaming nonce | `security.xss.csp-nonce-propagation` |
| `vercel/next.js#95182` unbounded Edge action body | `performance.backpressure.unbounded-queue` |
| `TanStack/query#11381` raw JSON in executable script | `security.xss.raw-json-script-serialization` |
| `vercel/next.js#98152` missing boundary-script nonce | `security.xss.csp-nonce-propagation` |
| `vercel/next.js#96580` destructive environment reload | `security.configuration.destructive-env-reload` |
| `TanStack/query#11270` nullable hydration root dereference | `quality.correctness.nullable-hydration-state` |
| `vercel/next.js#93154` repeated search-param cache collision | `quality.correctness.search-param-multivalue-key` |
| `TanStack/query#10079` stale promise after retry/reset | `react.hooks.stale-promise-ref` |
| `TanStack/query#11385` mount-time external-store subscription gap | `react.hooks.external-subscription-gap` |
| `TanStack/query#10006` cross-instance devtools state leak | `react.state.module-shared-instance-state` |
| `vercel/next.js#96252` pre-hydration navigation traversal gap | `react.hooks.browser-subscription-gap` |
| `TanStack/query#11326` missing SSR query-cache teardown | `quality.resource.server-cache-teardown` |
| `TanStack/query#11395` wall-clock dehydration timestamp | `quality.correctness.nondeterministic-snapshot-time` |
| `vercel/next.js#83200` manifest emitted in streamed body metadata | `quality.web.manifest-streamed-body` |
| `vercel/next.js#91586` undefined method guard identifier | `quality.correctness.undefined-method-guard` |

After the mapping manifest is applied, the observation contract should report **17 detected / 17 mapped** and **0 pending `must-find` mappings**.

This 17/17 result is the recall of the current **17 adjudicated positive expectations in the 50-case minimized corpus**. It is **not** evidence of universal or production-wide 100% recall. The sample is intentionally narrow and remains too small to establish a release-blocking real-world recall guarantee.

The observation field `precisionStatus` remains conservative because completing positive expectation mappings does not fully adjudicate every incidental production finding as a true or false positive. Precision must continue to be evaluated separately against representative positive and negative evidence.

## Recall-gap closure design

The final eight gaps were closed with generic deterministic rules rather than fixture-specific checks.

### Lifecycle / state races

- `react.hooks.stale-promise-ref` detects a promise ref exposed to callers while refresh logic is gated by terminal status and ignores promise/fetch replacement.
- `react.hooks.external-subscription-gap` detects external-store state read during render and subscribed later in a passive effect without snapshot reconciliation.
- `react.state.module-shared-instance-state` detects mutable module state used as component instance state and mutated by the same component, creating cross-instance interference.
- `react.hooks.browser-subscription-gap` detects browser/history snapshots read before hydration and event listeners attached later without reconciling the initial gap.

### SSR / streaming / resource correctness

- `quality.resource.server-cache-teardown` detects server/provider query clients unmounted without canceling pending work and clearing per-request cache state.
- `quality.correctness.nondeterministic-snapshot-time` detects wall-clock reads embedded directly in dehydration/snapshot metadata.
- `quality.web.manifest-streamed-body` detects `rel=manifest` markup emitted through body/streamed metadata instead of the eagerly emitted head.
- `quality.correctness.undefined-method-guard` detects class-method guards that reference bare identifiers unavailable in method, module, or runtime scope.

React-specific lifecycle/state behavior stays in the React plugin. Generic TypeScript, web-document, and server-resource correctness stays in the core AST contribution. No detector depends on a PR number, fixture id, or evaluation-only code path.

Incidental findings are not credited as true positives. For example, `react.hooks.missing-deps` is not considered evidence that a stale-promise, mount-subscription, or pre-hydration navigation race was detected unless a rule with matching semantics is also emitted.

## False-positive feedback loop

The first empirical pass used three upstream test-only clean controls. Before file-context tuning, two of three cases emitted three lifecycle/performance findings. The shared performance engine policy was then changed to suppress only production-runtime lifecycle rules in test files, while leaving unrelated performance analysis enabled. The same three cases subsequently emitted zero findings.

Batch 2 expanded the empirical denominator to five upstream-like negative controls. After the security, runtime-state, lifecycle/state, and SSR/resource rules were added, the 50-case observation still reports zero findings across those five controls and zero findings across all 14 clean controls. This is useful diagnostic evidence, but the denominator remains too small to claim a production false-positive rate.

## Human-adjudication corrections

During Batch 1, `TanStack/query#11380` was removed from the clean negative-control set. Manual verification showed that its Preact SSR guide contained the raw `JSON.stringify(...)`-inside-`<script>` example that `#11381` later fixed as XSS-unsafe. The clean slot was replaced by test-only `TanStack/query#11258`.

During Batch 2, `vercel/next.js#97284` was deliberately left `catalogued` rather than promoted because its relevant implementation is Rust-only. The current executable harness is TypeScript/TSX; inventing a TypeScript substitute would reduce fixture fidelity. The Batch-2 clean slot was instead filled by `TanStack/query#11378`.

These corrections are intentional evidence that catalog metadata is provisional until the relevant diff is human-reviewed.

## Promotion and next-quality policy

A catalogued PR becomes an executable evaluation case only after its relevant diff has been manually reviewed and a minimized reproduction can preserve the behavior. Prefer minimized reproductions over storing full external diffs.

With the current 17 positive expectations mapped, the next quality work should no longer optimize for this fixed recall denominator. The next step is to **expand the adjudicated executable denominator** with new positive and negative cases across representative production repositories, then use the larger evidence set to decide which rules need further tuning.

Fifty executable PRs are enough to expose meaningful precision and recall gaps, but they are **not enough to claim the documented 90% high-severity real-world precision target** or a general real-world recall target. Empirical precision/recall should become release-blocking only after several hundred adjudicated findings provide a representative denominator.
