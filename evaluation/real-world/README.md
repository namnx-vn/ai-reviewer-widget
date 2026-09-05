# Real-World Public PR Corpus

This directory documents the public pull requests used to seed minimized, deterministic evaluation fixtures.

The source code under `evaluation/fixtures/real-world/` is intentionally reduced to the smallest behavior needed for reviewer regression testing. The corpus does not clone or depend on external repositories at test time.

## Seed cases

| Corpus case | Public PR | Label intent |
| --- | --- | --- |
| `vercel-next-91593-component-tree-negative` | `vercel/next.js#91593` | Negative/noise-control case for intentional React/async performance code |
| `vercel-next-86406-health-endpoint` | `vercel/next.js#86406` | Must-find security expectation for operational details exposed by a health response |
| `vercel-next-86408-config-loader` | `vercel/next.js#86408` | Negative regression for fixed cache pollution plus advisory trusted-code execution boundary |

## Label semantics

- `must-find`: a human-reviewed issue that the reviewer should eventually detect reliably.
- `must-not-find`: a known-safe behavior used to measure false-positive pressure.
- `advisory`: a legitimate review consideration that should not become a blocking finding without stronger evidence.

The seed labels are not automatically counted as achieved precision until they map to production findings. Known gaps remain explicit rather than being converted into synthetic passing findings.

## Growth policy

Add public PR cases only when the diff has been manually reviewed and the expected behavior can be explained. Prefer minimized reproductions over storing full external diffs. Every case must preserve repository, PR number, canonical URL, and head SHA provenance.

A useful next target is 20–30 diverse PRs across React, Next.js, Node/TypeScript services, monorepos, security-sensitive code, and performance changes. Promotion into a blocking quality threshold should happen only after enough labels exist to support meaningful precision estimates.
