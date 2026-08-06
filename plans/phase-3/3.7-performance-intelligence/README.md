# Phase 3.7 — Performance Intelligence

> Engineering contract: [`../../../AGENTS.md`](../../../AGENTS.md)

Status: 🚧 In progress

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
| 3.7.0 | 🚧 In progress | [Performance Architecture Foundation](./3.7.0-performance-foundation.md) |
| 3.7.1 | 🚧 In progress | [Bundle & Dependency Efficiency](./3.7.1-bundle-dependencies.md) |
| 3.7.2 | 🚧 In progress | [React Rendering Performance](./3.7.2-react-rendering.md) |
| 3.7.3 | 🚧 In progress | [Loading & Code Splitting](./3.7.3-loading-code-splitting.md) |
| 3.7.4 | 🚧 In progress | [Image & Asset Performance](./3.7.4-images-assets.md) |
| 3.7.5 | 🚧 In progress | [Network & Request Efficiency](./3.7.5-network-requests.md) |
| 3.7.6 | 🚧 In progress | [Async & Concurrency Performance](./3.7.6-async-concurrency.md) |
| 3.7.7 | 🚧 In progress | [Memory & Resource Safety](./3.7.7-memory-resources.md) |
| 3.7.8 | 🚧 In progress | [CPU & Algorithmic Hotspots](./3.7.8-cpu-algorithms.md) |
| 3.7.9 | 🚧 In progress | [Database & Persistence Efficiency](./3.7.9-database-persistence.md) |
| 3.7.10 | ✅ Complete | [Cache Intelligence](./3.7.10-cache.md) |
| 3.7.11 | 🚧 In progress | [Transaction & Banking Critical Path](./3.7.11-banking-critical-path.md) |
| 3.7.12 | ✅ Complete | [Resilience, Timeout & Retry](./3.7.12-resilience-timeout-retry.md) |
| 3.7.13 | 🚧 In progress | [Backpressure & Rate Control](./3.7.13-backpressure-rate-control.md) |
| 3.7.14 | 🚧 In progress | [Observability & Performance Telemetry](./3.7.14-observability.md) |
| 3.7.15 | 🚧 In progress | [Frontend Banking UX Performance](./3.7.15-frontend-banking-ux.md) |
| 3.7.16 | ✅ Complete | [Performance Cost Propagation](./3.7.16-cost-propagation.md) |
| 3.7.17 | 🚧 In progress | [Interprocedural Performance Analysis](./3.7.17-interprocedural.md) |
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

## Implementation Audit (2026-08-31)

Implemented rules are intentionally recorded as partial until every rule ID and
detection/noise-control contract in the linked sub-plan is present. Current gaps:

- 3.7.0 context does not yet expose a reusable import graph or cross-file summaries.
- 3.7.1 lacks duplicate-dependency and duplicate-runtime-library analysis.
- 3.7.2 has existing React performance rules, but no Phase 3.7 rule-ID adapter.
- 3.7.3, 3.7.4, 3.7.6–3.7.9, 3.7.11, and 3.7.13–3.7.15 cover only a subset of their planned rules.
- 3.7.5 has the core request rules; wrapper/function-level dependency proofs still need expansion.
- 3.7.17 is currently same-file only; cross-file import/export summaries remain planned.

---

## Wave 5 Completion

Wave 5 is complete:

```text
3.7.10 Cache Intelligence                 ✅
3.7.12 Resilience, Timeout & Retry         ✅
3.7.16 Performance Cost Propagation        ✅
```

Validation evidence:

```text
TypeScript  ✅
Lint        ✅
Tests       ✅ 74 files / 602 tests
Build       ✅
```

The `3.7.16` symbolic cost-summary contract is now the required cost-analysis boundary for Phase `3.7.17` and later consumers.

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

Every sub-phase is complete only after:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

and after deterministic ordering plus false-positive regression checks pass.
