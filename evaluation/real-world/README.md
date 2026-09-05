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

The executable corpus now contains **50 manually reviewed public PR cases**. Every case runs offline through the shared production `ReviewUseCases.reviewFiles` path.

Current executable distribution:

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

The original three standalone minimized fixtures remain under `evaluation/fixtures/real-world/`. Promoted cases are stored in small offline fixture bundles:

- `promoted-security-batch-1.json`
- `promoted-react-batch-1.json`
- `promoted-clean-batch-1.json`
- `promoted-security-batch-2.json`
- `promoted-react-batch-2.json`
- `promoted-clean-batch-2.json`

Each bundled entry still receives a case-specific `.ts` or `.tsx` analysis path. Empirical controls retain the original-like upstream test path where path context affects production policy behavior. Bundle loading fails closed when a bundle is malformed or a fixture key is missing.

Each minimized case preserves repository, PR number, canonical URL, exact head SHA, human expectation, and catalog `fixtureId` linkage.

## Executable label semantics

- `must-find`: a human-reviewed issue that the reviewer should eventually detect reliably.
- `must-not-find`: a known-safe behavior used to measure false-positive pressure.
- `advisory`: a legitimate review consideration that should not become a blocking finding without stronger evidence.

Labels are not automatically counted as achieved precision or recall until they map to actual production findings. Known detection gaps remain explicit rather than being converted into synthetic passing findings.

## Empirical negative controls

Synthetic controls remain useful for deterministic regression coverage, but they are not mixed into the empirical false-positive denominator.

The first measurement pass used three upstream test-only clean controls with original-like `__tests__/*.test.tsx` paths. Before file-context tuning, two of three cases emitted three lifecycle/performance findings. After adding a shared performance engine policy that suppresses only production-runtime lifecycle rules in test files, the same three cases emitted zero findings while other performance rules remained enabled.

Batch 2 adds two more upstream test-only React/Vue Query controls with original-like test paths. Observation schema v3 therefore reports an aggregate `empiricalNegativeControls` metric across all empirical `must-not-find` cases, while retaining the clean-only metrics for historical comparison. The actual five-case rate is taken from the CI observation artifact; it is not hard-coded into this document before the corpus run completes.

These small denominators are diagnostic evidence, **not production precision guarantees**.

## Human-adjudication corrections

During Batch 1, `TanStack/query#11380` was removed from the clean negative-control set. Manual verification showed that its Preact SSR guide contained the raw `JSON.stringify(...)`-inside-`<script>` example that `#11381` later fixed as XSS-unsafe. The clean slot was replaced by test-only `TanStack/query#11258`.

During Batch 2, `vercel/next.js#97284` was deliberately left `catalogued` rather than promoted because its relevant implementation is Rust-only. The current executable harness is TypeScript/TSX; inventing a TypeScript substitute would reduce fixture fidelity. The Batch-2 clean slot was instead filled by `TanStack/query#11378`, while `#97284` remains a candidate for future multi-language evaluation support.

These corrections are intentional evidence that catalog metadata is provisional until the relevant diff is human-reviewed.

## Promotion policy

A catalogued PR becomes an executable evaluation case only after its relevant diff has been manually reviewed and a minimized reproduction can preserve the behavior. Prefer minimized reproductions over storing full external diffs.

Fifty executable PRs are enough to begin a more useful empirical baseline and to identify recurring false-positive clusters. They are **not enough to claim the documented 90% high-severity real-world precision target**. The next quality milestone is to map `must-find` expectations to exact production rule IDs from observed output, then expand toward several hundred adjudicated findings across representative projects before empirical precision becomes a blocking release threshold.
