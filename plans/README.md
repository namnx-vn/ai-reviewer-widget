# AI Reviewer Widget — Implementation Plans

> Detailed implementation plans for the AI Reviewer Widget.

**Engineering Contract:** [`../AGENTS.md`](../AGENTS.md)

---

## How Agents Must Use This Directory

Before implementing any feature:

1. Read [`../AGENTS.md`](../AGENTS.md)
2. Identify the relevant phase
3. Read the phase plan
4. Inspect the current implementation
5. Implement only the requested scope
6. Add/update tests
7. Run validation
8. Update plan status

The repository is always the source of truth.

---

# Roadmap

## Phase 1 — Foundation

Status: ✅ Completed

[Foundation Plan](./phase-1-foundation.md)

---

## Phase 2 — AST Analysis

Status: ✅ Completed

[AST Analysis Plan](./phase-2-ast-analysis.md)

---

# Phase 3 — Intelligence Engine

Status: ✅ Completed

[Phase 3 Overview](./phase-3/README.md)

### 3.1 — AI Review Core

✅ Completed

[Plan](./phase-3/3.1-ai-review-core.md)

### 3.2 — Architecture Intelligence

✅ Completed

[Plan](./phase-3/3.2-architecture-intelligence.md)

### 3.3 — AI Review Engine

✅ Completed

[Plan](./phase-3/3.3-ai-review-engine.md)

### 3.4 — React Intelligence

✅ Completed

[Phase 3.4](./phase-3/3.4-react-intelligence/README.md)

### 3.5 — Micro-Frontend Intelligence

✅ Completed

[Plan](./phase-3/3.5-micro-frontend-intelligence.md)

### 3.6 — Security Intelligence

✅ Completed

[Plan](./phase-3/3.6-security-intelligence/README.md)

### 3.7 — Performance Intelligence

✅ Completed

[Plan](./phase-3/3.7-performance-intelligence/README.md)

### 3.8 — Plugin SDK

✅ Completed

[Plan](./phase-3/3.8-plugin-sdk.md)

---

# Phase 4 — Platform

Status: ✅ Completed

[Phase 4 Overview](./phase-4/README.md)

| Phase | Status | Scope |
| --- | --- | --- |
| 4.1 | ✅ Complete | Local CLI |
| 4.2 | ✅ Complete | [Configuration & Rule Selection](./phase-4/4.2-configuration-rule-selection.md) |
| 4.3 | ✅ Complete | [Distributable CLI](./phase-4/4.3-distributable-cli.md) |
| 4.4 | ✅ Complete | [CI Adapters & Portable Review Output](./phase-4/4.4-ci-adapters.md) |
| 4.5 | ✅ Complete | [Platform API Boundary](./phase-4/4.5-platform-api-boundary.md) |
| 4.6 | ✅ Complete | [Persistence & Review History](./phase-4/4.6-persistence-review-history.md) |
| 4.7 | ✅ Complete | [Observability & Operational Diagnostics](./phase-4/4.7-observability.md) |
| 4.8 | ✅ Complete | [Organization Platform & Policy Governance](./phase-4/4.8-organization-platform.md) |

---

# Phase 5 — Advanced AI

Status: ✅ Completed for the currently defined scope

[Phase 5](./phase-5/README.md)

---

# Phase 6 — Real-World Review Reliability

Status: ✅ Complete through Phase 6.11

[Phase 6 Overview](./phase-6/README.md)

| Phase | Status | Scope |
| --- | --- | --- |
| 6.1 | ✅ Complete | [Real-World Evaluation Harness](./phase-6/6.1-evaluation-harness.md) |
| 6.2 | ✅ Complete | [Repository Context Intelligence](./phase-6/6.2-repository-context.md) |
| 6.3 | ✅ Complete | [Project Profiles & Environment Detection](./phase-6/6.3-project-profiles.md) |
| 6.4 | ✅ Complete | [Incremental PR Analysis](./phase-6/6.4-incremental-pr-analysis.md) |
| 6.5 | ✅ Complete | [Finding Quality, Suppression & Baselines](./phase-6/6.5-finding-quality-baselines.md) |
| 6.6 | ✅ Complete | [Production GitHub Review Workflow](./phase-6/6.6-github-review-workflow.md) |
| 6.7 | ✅ Complete | [Performance & Scale](./phase-6/6.7-performance-scale.md) |
| 6.8 | ✅ Complete | [AI Context Selection & Verification](./phase-6/6.8-ai-context-verification.md) |
| 6.9 | ✅ Complete | [Developer Feedback Loop](./phase-6/6.9-developer-feedback.md) |
| 6.10 | ✅ Complete | [Production Readiness & v1 Contract](./phase-6/6.10-production-readiness.md) |
| 6.11 | ✅ Complete | [Evaluation Expansion Wave](./phase-6/6.11-evaluation-expansion-wave.md) |

---

# Phase 7 — Continuous Review Intelligence & Reliability

Status: ⏳ Planned

Prerequisite: Phase 6.11 must be completed and its expanded evaluation/adjudication baseline frozen before Phase 7 production behavior changes are promoted.

[Phase 7 Overview](./phase-7/README.md)

| Phase | Status | Scope |
| --- | --- | --- |
| 7.1 | 📌 Next after 6.11 | Ground Truth & Adjudication Expansion |
| 7.2 | ⏳ Planned | Reliability Scorecard |
| 7.3 | ⏳ Planned | Confidence Calibration |
| 7.4 | ⏳ Planned | Evidence Graph & Finding Evidence Contract |
| 7.5 | ⏳ Planned | Semantic Program Intelligence |
| 7.6 | ⏳ Planned | Finding Verification Pipeline |
| 7.7 | ⏳ Planned | Counterexample Engine |
| 7.8 | ⏳ Planned | Developer Outcome Learning |
| 7.9 | ⏳ Planned | Automated Failure Mining |
| 7.10 | ⏳ Planned | Improvement Proposal Agent |
| 7.11 | ⏳ Planned | Regression Case Generation |
| 7.12 | ⏳ Planned | Candidate Tournament & Promotion Gates |
| 7.13 | ⏳ Planned | Shadow Review |
| 7.14 | ⏳ Planned | Repository-Adaptive Intelligence |
| 7.15 | ⏳ Planned | Temporal & Historical Review Intelligence |
| 7.16 | ⏳ Planned | Differential / Change-Introduced Analysis |
| 7.17 | ⏳ Planned | Metamorphic / Semantic Stability Testing |
| 7.18 | ⏳ Planned | Adversarial Reviewer Testing |
| 7.19 | ⏳ Planned | Reviewer Trust Policy |
| 7.20 | ⏳ Planned | Production Reliability SLO & Continuous Quality Gate |

Phase 7 is organized into four execution waves: Measure Truth, Improve Reasoning, Continuous Learning, and Safe Self-Improvement & Production Hardening. The detailed dependencies, safety contract, target metrics, and completion criteria are defined in the Phase 7 overview.

---

# R1 — Source Architecture Refactor

Status: ✅ Completed

[Source Architecture Refactor](./source-architecture-refactor.md)

---

# Status Legend

| Status | Meaning |
|---|---|
| ✅ | Completed |
| 🚧 | In Progress |
| 📌 | Next |
| ⏳ | Planned |
| 🔮 | Future |
| ⚠️ | Blocked |
