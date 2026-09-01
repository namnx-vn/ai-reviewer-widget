# Implementation Phases

This document separates roadmap intent from implementation evidence. Statuses below use `AGENTS.md`/`plans/` plus inspected source. Where a phase-to-code mapping is broader than the inspected evidence, the row is marked `Needs confirmation` rather than treated as fact.

| Phase | Objective | Status | Implemented work | Related source | Limitations |
| --- | --- | --- | --- | --- | --- |
| 1 — Foundation | Establish the application and review domain foundation. | Completed | React/Vite/TypeScript app, review domain types/components, repository quality tooling. | `src/`, `package.json` | Exact historical boundaries should be verified from commits if needed. |
| 2 — AST Analysis | Add deterministic AST-based analysis. | Completed | Parser/analyzer boundary and deterministic finding generation. | `src/analyzer/ast/`, `src/analyzer/index.ts` | Current analyzer supports JS/TS-family parsing; other languages are out of scope. |
| 3.1 — AI Review Core | Add AI provider/review capability. | Completed | AI provider abstraction and conversion of AI findings into review findings. | `src/ai/`, `src/review/reviewer.ts` | AI configuration is environment-driven; provider availability depends on credentials. |
| 3.2 — Architecture Intelligence | Add deterministic architecture review. | Completed | Architecture analyzer/rules integrated into deterministic analysis. | `src/analyzer/architecture/` | Rule coverage is repository-defined rather than a general architecture verifier. |
| 3.3 — AI Review Engine | Normalize and orchestrate deterministic + AI review. | Completed | `ReviewEngine`, aggregation, scoring/decision pipeline. | `src/engine/`, `src/review/` | Exact scoring policy should be changed only with tests. |
| 3.4 — React Intelligence | Add React-specific semantic analysis. | Completed | Rule framework; semantic analysis; hooks; rendering; state; performance; context; patterns; Next.js; RSC; integration; hardening. | `src/react/` | React analysis is applied to JSX/TSX; App Router plugins are selected by path convention. |
| 3.5 — Micro Frontend Intelligence | Detect MFE boundary/architecture issues. | Completed | Dedicated MFE subsystem and architecture findings. | `src/mfe/`, architecture tests | Framework-specific federation/runtime behavior may not be fully modeled. |
| 3.6 — Security Intelligence | Add deterministic, bank-grade-oriented security intelligence. | Completed | Security rule engine/registry, rule families, taint flow, interprocedural flow, supply-chain analysis, compliance mapping, profiles/policies, and quality gates. | `src/analyzer/security/` | Security analysis reduces risk but is not equivalent to a formal security certification or penetration test. |
| 3.7 — Performance Intelligence | Extend performance analysis. | Completed | Deterministic performance engine, rule registry, interprocedural analysis, profiles, and quality gates. | `src/analyzer/performance/` | Static heuristics require runtime profiling for final performance conclusions. |
| 3.8 — Plugin SDK | Expose extensibility through a plugin SDK. | Completed | Typed registry for AST, React, analyzer, AI-provider, and output contributions. | `src/plugins/` | Host entry points must explicitly compose a plugin registry. |
| R1 — Source Architecture Refactor | Establish domain/application/adapters boundaries. | Completed | Pure review domain, injected application use cases, shared analyzer/plugin composition, thin adapters, UI separation, module decomposition, and boundary tests. | `src/domain/`, `src/application/`, `src/analyzer/composition/`, `src/ui/` | Legacy import paths remain intentional compatibility exports. |
| 4.2 — Configuration & Rule Selection | Make `.ai-reviewer.json` a typed application input for shared review behavior. | Completed | Versioned config resolver, explicit defaults, path filtering, rule-family and rule-ID selection, severity/profile policy, CLI/GitHub/plugin integration, and rule catalogs. | `src/config/`, `src/cli/config-file.ts`, `src/analyzer/composition/`, `src/application/review/`, `src/github/review-pull-request.ts`, `src/plugins/review-use-cases.ts` | Branch coverage remains a repository-wide gap at 77.44%; Phase 4.2 validation commands pass. |

## Phase 3.4 detail

`AGENTS.md` records the following sub-phases as complete: 3.4.1 rule framework, 3.4.2 semantic analysis, 3.4.3 hooks, 3.4.4 rendering, 3.4.5 state, 3.4.6 performance, 3.4.7 context, 3.4.8 patterns, 3.4.9 Next.js, 3.4.10 RSC, 3.4.11 integration, and 3.4.12 hardening. Their plan files are under `plans/phase-3/3.4-react-intelligence/` and current implementation is under `src/react/`.

## Phase 3.6 detail

The current security package publicly exposes:

- `SecurityAnalysisEngine` and `SecurityRuleRegistry`;
- intra- and interprocedural taint analysis;
- supply-chain analysis;
- compliance registries/reports and default mappings;
- security quality-gate evaluation;
- security profiles and policy resolution;
- rule families for dangerous execution, authentication, authorization, browser security, crypto, injection, network transport, configuration, object security, sensitive data, logging/error handling, business security, SSRF, filesystem, secrets, and session/token handling.

Verification path: inspect `src/analyzer/security/index.ts`, the relevant rule directories, and their test suites.

## Unclassified implementations

The browser demo UI, Playwright dashboard smoke test, and some repository tooling cannot be reliably assigned to a single roadmap phase from the current source snapshot alone. They are implemented, but their exact originating phase is **Needs confirmation** if historical attribution matters.

## Historical confirmation

For a release-grade phase history, correlate each plan with Git commits/tags and record commit ranges. This audit prioritizes current implementation accuracy over reconstructing dates from roadmap text alone.
