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

The 100-entry catalog is therefore a **selection and labeling backlog**, not a claim that 100 PRs have already been executed by the local reviewer.

## Executable minimized corpus

The executable corpus now contains **30 manually reviewed public PR cases**. Every case runs offline through the shared production `ReviewUseCases.reviewFiles` path.

Current executable distribution:

| Group | Executable PRs |
| --- | ---: |
| Security / trust boundary | 12 |
| React / hooks / reactive lifecycle | 7 |
| Performance negative control | 1 |
| Clean false-positive controls | 10 |
| **Total** | **30** |

Current human expectation labels:

| Label | Expectations |
| --- | ---: |
| `must-find` | 11 |
| `must-not-find` | 18 |
| `advisory` | 3 |
| **Total** | **32** |

The original three standalone minimized fixtures remain under `evaluation/fixtures/real-world/`. Batch-1 promoted cases are stored as small offline fixture bundles:

- `promoted-security-batch-1.json`
- `promoted-react-batch-1.json`
- `promoted-clean-batch-1.json`

Each bundled entry still receives its own virtual `.ts` or `.tsx` path when passed to the reviewer, so parser behavior, finding identity, deterministic replay, and PR provenance remain case-specific.

Each minimized case preserves repository, PR number, canonical URL, exact head SHA, human expectation, and catalog `fixtureId` linkage. Bundle loading fails closed when a bundle is malformed or a fixture key is missing.

## Executable label semantics

- `must-find`: a human-reviewed issue that the reviewer should eventually detect reliably.
- `must-not-find`: a known-safe behavior used to measure false-positive pressure.
- `advisory`: a legitimate review consideration that should not become a blocking finding without stronger evidence.

Labels are not automatically counted as achieved precision until they map to actual production findings. Known detection gaps remain explicit rather than being converted into synthetic passing findings.

## Human-adjudication correction

During the 30-case promotion pass, `TanStack/query#11380` was removed from the clean negative-control set. Manual verification showed that its Preact SSR guide contained the raw `JSON.stringify(...)`-inside-`<script>` example that `#11381` later fixed as XSS-unsafe.

The clean slot was replaced by `TanStack/query#11258`, a merged test-only file-renaming/consolidation change with no runtime production code change. A regression test now prevents `#11380` from being reintroduced as a clean control.

This correction is intentional evidence that catalog metadata is provisional until the relevant diff is human-reviewed.

## Promotion policy

A catalogued PR becomes an executable evaluation case only after its relevant diff has been manually reviewed and a minimized reproduction can preserve the behavior. Prefer minimized reproductions over storing full external diffs.

Thirty executable PRs are enough to begin a first empirical baseline and identify obvious false-positive clusters, but they are **not enough to claim the documented 90% high-severity real-world precision target**. Continue expanding toward 50+ executable PRs, then toward several hundred adjudicated findings across representative projects before promoting empirical precision into a blocking release threshold.
