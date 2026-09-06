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

- `must-find`: a human-reviewed issue that the reviewer should eventually detect reliably.
- `must-not-find`: a known-safe behavior used to measure false-positive pressure.
- `advisory`: a legitimate review consideration that should not become a blocking finding without stronger evidence.

Labels are not automatically counted as achieved precision or recall. `src/evaluation/real-world-rule-mapping.ts` separately records only human-reviewed mappings from a `must-find` expectation to acceptable production `ruleId` values. Unmapped expectations remain pending instead of receiving synthetic credit.

## Current observation baseline

The current 50-case CI observation is deterministic across all cases:

- 50 / 50 stable cases
- 21 production findings emitted across the corpus
- 5 empirical negative controls
- 0 / 5 empirical negative controls with findings
- 0 empirical negative-control findings at medium severity or higher
- 14 clean controls
- 0 / 14 clean controls with findings

The five empirical negative controls consist of three Query Core clean test PRs plus two Vue Query test-only PRs, all analyzed with upstream-like `__tests__/*.test.ts(x)` paths.

## Verified production-rule mappings

The mapped `must-find` subset has expanded from 1 to **9 of 17 expectations**. Every mapping below was added only after the production observation emitted the corresponding rule on the minimized fixture:

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

The observation therefore reports **9 detected / 9 mapped**, with **8 of 17 `must-find` expectations still pending rule mapping**. The 9/9 number is only the recall of the deliberately mapped subset; it is **not** a 100% real-world recall claim.

The two generic runtime-state checks were placed in the core AST contribution rather than the React contribution because the relevant public reproductions are ordinary `.ts` code and do not require a React surface. This keeps the production detector aligned with the behavior being measured and avoids duplicate findings on React files.

Incidental findings are not credited as true positives. For example, a `react.hooks.missing-deps` finding is not considered evidence that a stale-promise, mount-subscription, or pre-hydration navigation race was detected unless the rule and evidence actually match the adjudicated expectation.

### Remaining unmapped `must-find` backlog

The eight pending expectations are:

- `TanStack/query#10079` stale query promise after retry/reset
- `TanStack/query#11385` cached-query mount subscription gap
- `TanStack/query#10006` devtools cross-instance state leak
- `vercel/next.js#96252` pre-hydration history traversal race
- `TanStack/query#11326` missing server query-cache teardown
- `TanStack/query#11395` non-deterministic dehydration timestamp
- `vercel/next.js#83200` manifest emitted in the streamed body instead of the head
- `vercel/next.js#91586` noop-tracer force-context correctness

These now form the next recall backlog; they remain pending instead of receiving credit from unrelated findings.

## False-positive feedback loop

The first empirical pass used three upstream test-only clean controls. Before file-context tuning, two of three cases emitted three lifecycle/performance findings. The shared performance engine policy was then changed to suppress only production-runtime lifecycle rules in test files, while leaving unrelated performance analysis enabled. The same three cases subsequently emitted zero findings.

Batch 2 expanded the empirical denominator to five upstream-like negative controls. After the new security and core-correctness rules were added, the 50-case observation still reports zero findings across those five controls and zero findings across all 14 clean controls. This is useful diagnostic evidence, but the denominator remains too small to claim a production false-positive rate.

## Human-adjudication corrections

During Batch 1, `TanStack/query#11380` was removed from the clean negative-control set. Manual verification showed that its Preact SSR guide contained the raw `JSON.stringify(...)`-inside-`<script>` example that `#11381` later fixed as XSS-unsafe. The clean slot was replaced by test-only `TanStack/query#11258`.

During Batch 2, `vercel/next.js#97284` was deliberately left `catalogued` rather than promoted because its relevant implementation is Rust-only. The current executable harness is TypeScript/TSX; inventing a TypeScript substitute would reduce fixture fidelity. The Batch-2 clean slot was instead filled by `TanStack/query#11378`.

These corrections are intentional evidence that catalog metadata is provisional until the relevant diff is human-reviewed.

## Promotion policy

A catalogued PR becomes an executable evaluation case only after its relevant diff has been manually reviewed and a minimized reproduction can preserve the behavior. Prefer minimized reproductions over storing full external diffs.

Fifty executable PRs are enough to identify recurring precision and recall gaps, but they are **not enough to claim the documented 90% high-severity real-world precision target**. The next quality work should focus on the eight remaining unmapped `must-find` expectations, then grow toward several hundred adjudicated findings across representative production repositories before empirical precision or recall becomes a blocking release threshold.
