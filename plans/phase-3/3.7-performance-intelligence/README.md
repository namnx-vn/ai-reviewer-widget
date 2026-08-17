# Phase 3.7 — Performance Intelligence

> Engineering contract: [`../../../AGENTS.md`](../../../AGENTS.md)

Status: ✅ Complete

---

## Objective

Build deterministic performance, scalability, resource-efficiency, and resilience analysis suitable for high-assurance financial and banking software.

The analyzer MUST identify source-level performance and reliability risks without claiming that static analysis proves production latency, throughput, capacity, or SLO compliance.

Core invariant:

```text
same source + same configuration + same analyzer version
= same findings + same finding IDs + same ordering
```

Probabilistic AI MUST NOT participate in performance finding detection.

---

## Architecture Principles

- Performance rules belong to deterministic analysis.
- React-specific performance rules remain in the React boundary and reuse shared performance primitives.
- Detection semantics and policy severity are separate.
- Shared cost/flow/interprocedural analysis MUST be reusable across rules.
- No rule may create its own competing call graph or cost-propagation engine.
- Static findings indicate code risk, not measured production behavior.
- Runtime SLOs still require load testing, tracing, metrics, capacity planning, and production telemetry.

---

## Sub-phases

| Phase | Status | Plan |
| --- | --- | --- |
| 3.7.0 | ✅ Complete | [Performance Architecture Foundation](./3.7.0-performance-foundation.md) |
| 3.7.1 | ✅ Complete | [Bundle & Dependency Efficiency](./3.7.1-bundle-dependencies.md) |
| 3.7.2 | ✅ Complete | [React Rendering Performance](./3.7.2-react-rendering.md) |
| 3.7.3 | ✅ Complete | [Loading & Code Splitting](./3.7.3-loading-code-splitting.md) |
| 3.7.4 | ✅ Complete | [Image & Asset Performance](./3.7.4-images-assets.md) |
| 3.7.5 | ✅ Complete | [Network & Request Efficiency](./3.7.5-network-requests.md) |
| 3.7.6 | ✅ Complete | [Async & Concurrency Performance](./3.7.6-async-concurrency.md) |
| 3.7.7 | ✅ Complete | [Memory & Resource Safety](./3.7.7-memory-resources.md) |
| 3.7.8 | ✅ Complete | [CPU & Algorithmic Hotspots](./3.7.8-cpu-algorithms.md) |
| 3.7.9 | ✅ Complete | [Database & Persistence Efficiency](./3.7.9-database-persistence.md) |
| 3.7.10 | ✅ Complete | [Cache Intelligence](./3.7.10-cache.md) |
| 3.7.11 | ✅ Complete | [Transaction & Banking Critical Path](./3.7.11-banking-critical-path.md) |
| 3.7.12 | ✅ Complete | [Resilience, Timeout & Retry](./3.7.12-resilience-timeout-retry.md) |
| 3.7.13 | ✅ Complete | [Backpressure & Rate Control](./3.7.13-backpressure-rate-control.md) |
| 3.7.14 | ✅ Complete | [Observability & Performance Telemetry](./3.7.14-observability.md) |
| 3.7.15 | ✅ Complete | [Frontend Banking UX Performance](./3.7.15-frontend-banking-ux.md) |
| 3.7.16 | ✅ Complete | [Performance Cost Propagation](./3.7.16-cost-propagation.md) |
| 3.7.17 | ✅ Complete | [Interprocedural Performance Analysis](./3.7.17-interprocedural.md) |
| 3.7.18 | ✅ Complete | [Performance Profiles](./3.7.18-performance-profiles.md) |
| 3.7.19 | ✅ Complete | [Performance Quality Gates](./3.7.19-quality-gates.md) |

---

## Dependency Order

```text
3.7.0
 ├─ 3.7.1 ─ 3.7.3 ─ 3.7.4
 ├─ 3.7.2
 ├─ 3.7.5 ─ 3.7.6 ─ 3.7.12 ─ 3.7.13
 ├─ 3.7.7
 ├─ 3.7.8
 ├─ 3.7.9 ─ 3.7.10
 └─ 3.7.16 ─ 3.7.17
                 ├─ 3.7.11
                 ├─ 3.7.14
                 └─ 3.7.15
                       ↓
                    3.7.18
                       ↓
                    3.7.19
```

Later phases MUST reuse the foundation, cost model, and interprocedural summaries rather than inventing alternatives.

---

## Completion Audit (2026-08-31)

The repository was audited against every linked Phase 3.7 sub-plan and the remaining gaps were completed.

Delivered completion work includes:

- 3.7.0 repository-aware performance context with reusable import/package metadata.
- 3.7.1 dependency duplication, runtime duplication, barrel, heavy-library, and large-import coverage.
- 3.7.2 a dedicated React Phase 3.7 adapter with the planned performance and banking-critical UI rule IDs.
- 3.7.3–3.7.9 complete loading, asset, network, async/concurrency, memory/resource, CPU/algorithm, and configured persistence rule sets.
- 3.7.11 complete configured banking-critical transaction analysis.
- 3.7.13 complete queue, producer, stream-control, concurrency-limit, and hot-loop rate-control analysis.
- 3.7.14 configured critical-path latency, external-call timing, and retry-attempt telemetry analysis.
- 3.7.15 banking-critical frontend performance rules activated only through explicit critical UI configuration.
- 3.7.17 cross-file import/export performance summaries and cost propagation while retaining deterministic cycle/safety limits.
- Existing 3.7.10 cache, 3.7.12 resilience, 3.7.16 symbolic cost propagation, 3.7.18 profiles, and 3.7.19 quality gates remain the shared production contracts.

Focused completion regression coverage validates exact rule registration, package-lock dependency duplication, repository propagation, configured database adapters, critical paths, React adapters, and false-positive boundaries.

---

## Shared Rule Contract

Every rule MUST define:

- stable rule ID;
- category;
- default severity;
- confidence;
- trigger conditions;
- non-trigger conditions;
- evidence;
- remediation guidance or remediation ID;
- focused tests;
- false-positive tests.

Severity represents impact if the issue is real. Confidence represents certainty of detection. They MUST remain separate.

---

## Banking Performance Principle

Banking-critical flows include, at minimum:

```text
authentication
MFA / OTP
account lookup
balance retrieval
beneficiary validation
payment initiation
payment authorization
transaction posting
transaction confirmation
```

Profiles may raise severity for findings on those paths, but the underlying detection evidence MUST remain unchanged.

---

## Validation

Phase 3.7 is complete only when the repository passes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

plus CI coverage, deterministic ordering, false-positive regressions, and end-to-end validation.
