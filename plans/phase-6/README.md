# Phase 6 — Real-World Review Reliability

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: ✅ Complete

---

## Objective

Transform the platform core into a reviewer that can be trusted on real production codebases.

Phase 6 prioritizes precision, repository context, incremental PR analysis, explainable findings, measurable quality, stable review lifecycle, and production-scale performance over adding more rule families.

The primary success criterion is:

> Developers can run the reviewer continuously on real projects and trust that important findings are useful, actionable, reproducible, and low-noise.

---

## Principles

1. Precision before recall for high-severity findings.
2. Repository context before isolated-file heuristics when correctness depends on cross-file behavior.
3. Deterministic review remains higher-trust than AI enrichment.
4. PR review should be incremental by default while repository-scoped rules remain safe.
5. Every production finding must contain meaningful evidence.
6. False positives are treated as product defects and must be measurable.
7. Adapters must continue to use the shared application review pipeline.

---

## Target Quality Metrics

| Metric | Initial Target |
| --- | --- |
| High-severity precision | >= 90% |
| High-severity false-positive rate | <= 10% |
| Deterministic stability for identical input/config | 100% |
| Duplicate finding rate | < 3% |
| Incremental PR review success rate | >= 99% |
| Medium repository review target | < 60 seconds |
| Rule crash rate on evaluation corpus | 0% |
| Unexplained high-severity findings | 0 |

These are engineering targets measured by the evaluation harness, not product guarantees. Where the current evaluation corpus is not statistically sufficient to establish a target — notably real-world high-severity precision — CI reports the available metrics and the v1 production contract records **insufficient evidence** rather than claiming an unsupported guarantee.

---

## Roadmap

| Phase | Status | Scope | Plan |
| --- | --- | --- | --- |
| 6.1 | ✅ Complete | Real-World Evaluation Harness | [6.1](./6.1-evaluation-harness.md) |
| 6.2 | ✅ Complete | Repository Context Intelligence | [6.2](./6.2-repository-context.md) |
| 6.3 | ✅ Complete | Project Profiles & Environment Detection | [6.3](./6.3-project-profiles.md) |
| 6.4 | ✅ Complete | Incremental PR Analysis | [6.4](./6.4-incremental-pr-analysis.md) |
| 6.5 | ✅ Complete | Finding Quality, Suppression & Baselines | [6.5](./6.5-finding-quality-baselines.md) |
| 6.6 | ✅ Complete | Production GitHub Review Workflow | [6.6](./6.6-github-review-workflow.md) |
| 6.7 | ✅ Complete | Performance & Scale | [6.7](./6.7-performance-scale.md) |
| 6.8 | ✅ Complete | AI Context Selection & Verification | [6.8](./6.8-ai-context-verification.md) |
| 6.9 | ✅ Complete | Developer Feedback Loop | [6.9](./6.9-developer-feedback.md) |
| 6.10 | ✅ Complete | Production Readiness & v1 Contract | [6.10](./6.10-production-readiness.md) |

---

## Execution Order

```text
6.1 Evaluation Harness
        ↓
6.2 Repository Context
   ┌────┼─────────────┐
   ↓    ↓             ↓
6.3   6.4           6.8
Profiles Incremental AI Context
   ↓    ↓             │
   └─→ 6.5 ←──────────┘
       Baselines
          ↓
6.6 GitHub Workflow
          ↓
6.7 Performance & Scale
          ↓
6.9 Developer Feedback
          ↓
6.10 Production Readiness
```

6.1 preceded reliability work so later changes could be measured objectively. 6.7 benchmarks the incremental architecture introduced by 6.4 rather than optimizing the old full-scan model. 6.9 depends on stable finding identity from 6.5.

---

## Target Architecture

```text
Repository
    ↓
Repository Context
    ↓
Full / Incremental Scope
    ↓
Deterministic Analysis
    ↓
Finding Evidence
    ↓
Optional Bounded AI Review
    ↓
Finding Verification
    ↓
Review Engine
    ↓
Baseline / History / Feedback
    ↓
Review Result
    ↓
CLI / CI / GitHub / Platform
```

Phase 6 preserves R1 dependency boundaries. Rules do not independently discover the filesystem, call GitHub, access persistence, or read process environment.

---

## Non-Goals

Phase 6 does not include autonomous code modification, automatic commits, model training/fine-tuning, billing, subscriptions, enterprise SSO, full RBAC, hosted dashboard redesign, plugin marketplace, arbitrary language support, or replacing deterministic review with agents.

---

## Completion Criteria

Phase 6 is complete because:

- [x] reviewer quality is measured objectively on a versioned evaluation corpus
- [x] repository-level context is available to deterministic analyzers
- [x] project profiles are deterministic and configurable
- [x] PRs support dependency-aware incremental analysis
- [x] finding identity survives ordinary line movement
- [x] baseline and suppression workflows exist
- [x] GitHub output has stable lifecycle behavior across repeated pushes
- [x] review performance is benchmarked at realistic repository sizes
- [x] AI receives bounded relevant repository context
- [x] AI findings follow evidence-aware confidence behavior
- [x] developer feedback can be recorded without automatically mutating rules
- [x] production-facing schemas have compatibility and migration policies
- [x] evaluation quality targets are continuously reported, with insufficient evidence stated explicitly where applicable
- [x] deterministic output remains reproducible
- [x] no adapter duplicates application review logic
- [x] all Phase 6 sub-plan acceptance criteria are complete
- [x] release validation includes typecheck, lint, evaluation, benchmark, coverage, build, packed CLI validation, security gates, and e2e

The Phase 6.10 release candidate was validated by GitHub Actions run `33746987515` on commit `c63daf079c3eede9ae5ffabc8677352cf18ed3d6` before this roadmap was marked complete.
