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

The first 50-case CI observation is deterministic across all cases:

- 50 / 50 stable cases
- 13 production findings emitted across the corpus
- 5 empirical negative controls
- 0 / 5 empirical negative controls with findings
- 0 empirical negative-control findings at medium severity or higher
- 14 clean controls
- 0 / 14 clean controls with findings

The five empirical negative controls consist of three Query Core clean test PRs plus two Vue Query test-only PRs, all analyzed with upstream-like `__tests__/*.test.ts(x)` paths.

The first rule mapping is intentionally narrow:

- `vercel/next.js#95182` `unbounded-action-body`
  → `performance.backpressure.unbounded-queue`

This gives a mapped recall sample of **1 detected / 1 mapped**, while **16 of 17 `must-find` expectations remain pending rule mapping**. A 1/1 mapped sample is not statistically meaningful and must not be presented as 100% real-world recall.

Incidental findings are not credited as true positives. For example, a `react.hooks.missing-deps` finding is not considered evidence that a stale-promise, mount-subscription, or pre-hydration navigation race was detected unless the rule and evidence actually match the adjudicated expectation.

## False-positive feedback loop

The first empirical pass used three upstream test-only clean controls. Before file-context tuning, two of three cases emitted three lifecycle/performance findings. The shared performance engine policy was then changed to suppress only production-runtime lifecycle rules in test files, while leaving unrelated performance analysis enabled. The same three cases subsequently emitted zero findings.

Batch 2 expanded the empirical denominator to five upstream-like negative controls, and the 50-case observation still reports zero findings across those five controls. This is useful diagnostic evidence, but the denominator remains too small to claim a production false-positive rate.

## Human-adjudication corrections

During Batch 1, `TanStack/query#11380` was removed from the clean negative-control set. Manual verification showed that its Preact SSR guide contained the raw `JSON.stringify(...)`-inside-`<script>` example that `#11381` later fixed as XSS-unsafe. The clean slot was replaced by test-only `TanStack/query#11258`.

During Batch 2, `vercel/next.js#97284` was deliberately left `catalogued` rather than promoted because its relevant implementation is Rust-only. The current executable harness is TypeScript/TSX; inventing a TypeScript substitute would reduce fixture fidelity. The Batch-2 clean slot was instead filled by `TanStack/query#11378`.

These corrections are intentional evidence that catalog metadata is provisional until the relevant diff is human-reviewed.

## Promotion policy

A catalogued PR becomes an executable evaluation case only after its relevant diff has been manually reviewed and a minimized reproduction can preserve the behavior. Prefer minimized reproductions over storing full external diffs.

Fifty executable PRs are enough to begin a useful empirical baseline and identify recurring false-positive clusters. They are **not enough to claim the documented 90% high-severity real-world precision target**. The next quality work is to expand exact rule mappings for the remaining `must-find` expectations, fix the highest-value security/react recall gaps revealed by those mappings, and then grow toward several hundred adjudicated findings across representative production repositories before empirical precision becomes a blocking release threshold.
