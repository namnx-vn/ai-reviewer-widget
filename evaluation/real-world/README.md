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

The source code under `evaluation/fixtures/real-world/` is intentionally reduced to the smallest behavior needed for deterministic regression testing. The corpus does not clone or depend on external repositories at test time.

Current minimized cases:

| Corpus case | Public PR | Label intent |
| --- | --- | --- |
| `vercel-next-91593-component-tree-negative` | `vercel/next.js#91593` | Negative/noise-control case for intentional React/async performance code |
| `vercel-next-86406-health-endpoint` | `vercel/next.js#86406` | Must-find security expectation for operational details exposed by a health response |
| `vercel-next-86408-config-loader` | `vercel/next.js#86408` | Negative regression for fixed cache pollution plus advisory trusted-code execution boundary |

Each minimized case preserves repository, PR number, canonical URL, and exact head SHA provenance. Its `fixtureId` is linked from the 100-PR catalog and validated in tests.

## Executable label semantics

- `must-find`: a human-reviewed issue that the reviewer should eventually detect reliably.
- `must-not-find`: a known-safe behavior used to measure false-positive pressure.
- `advisory`: a legitimate review consideration that should not become a blocking finding without stronger evidence.

Seed labels are not automatically counted as achieved precision until they map to production findings. Known gaps remain explicit rather than being converted into synthetic passing findings.

## Promotion policy

A catalogued PR becomes an executable evaluation case only after its relevant diff has been manually reviewed and a minimized reproduction can preserve the behavior. Prefer minimized reproductions over storing full external diffs.

Real-world precision may be promoted to a blocking quality threshold only after enough `positive-candidate` entries have been human-verified and enough negative controls have actually been executed. Catalog size alone is not evidence of reviewer precision.
