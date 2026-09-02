# Phase 4 — Platform

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: ✅ Complete

---

## Objective

Transform the completed review intelligence engine into a reusable developer platform while preserving one shared application review pipeline for CLI, GitHub, plugins, CI, and future hosted adapters.

Phase 4 is productization/platformization work. It must not weaken deterministic analysis, duplicate review orchestration, or move infrastructure concerns into `domain/` or analyzers.

---

## Platform Principles

1. **One review pipeline** — CLI, GitHub, CI, plugins, and future APIs must delegate to shared application use cases.
2. **Configuration before distribution** — stable config/rule semantics come before packaging and broader integrations.
3. **Contracts before infrastructure** — define typed ports and versioned request/result contracts before choosing hosted frameworks, databases, or telemetry vendors.
4. **Deterministic behavior first** — configuration, policy resolution, rule ordering, quality gates, and historical matching must be explainable and deterministic.
5. **Adapters own IO** — filesystem, process, GitHub, network, storage, and telemetry vendor concerns stay outside domain/analyzer logic.
6. **Backward compatibility** — existing CLI/GitHub findings, warnings, scores, decisions, quality gates, and exit semantics must remain stable unless an active sub-plan explicitly authorizes a change.
7. **No speculative dependencies** — new runtime/framework dependencies require an implementation-time architectural justification and explicit approval.

---

## Roadmap

| Phase | Status | Scope | Plan |
| --- | --- | --- | --- |
| 4.1 | ✅ Complete | Local CLI | Current document |
| 4.2 | ✅ Complete | Configuration & Rule Selection | [4.2](./4.2-configuration-rule-selection.md) |
| 4.3 | ✅ Complete | Distributable CLI | [4.3](./4.3-distributable-cli.md) |
| 4.4 | ✅ Complete | CI Adapters & Portable Review Output | [4.4](./4.4-ci-adapters.md) |
| 4.5 | ✅ Complete | Platform API Boundary | [4.5](./4.5-platform-api-boundary.md) |
| 4.6 | ✅ Complete | Persistence & Review History | [4.6](./4.6-persistence-review-history.md) |
| 4.7 | ✅ Complete | Observability & Operational Diagnostics | [4.7](./4.7-observability.md) |
| 4.8 | ✅ Complete | Organization Platform & Policy Governance | [4.8](./4.8-organization-platform.md) |

---

## Execution Order

Recommended critical path:

```text
4.1 Local CLI ✅
       ↓
4.2 Configuration & Rule Selection ✅
       ↓
4.3 Distributable CLI ✅ ────┐
       ↓                     │
4.4 CI Adapters ✅           │
                             │
4.5 Platform API Boundary ✅ ◀┘
       ↓              ↓
4.6 Persistence ✅  4.7 Observability ✅
       └──────┬───────┘
              ↓
4.8 Organization Platform ✅
```

Notes:

- 4.5 may begin after 4.2 once configuration semantics are stable; it does not need to wait for every CLI/CI packaging detail.
- 4.6 and 4.7 may progress in parallel after the platform API/application boundary is stable.
- 4.8 depends on stable configuration, platform contracts, persisted policy provenance, and operational diagnostics.
- Phase 4 is complete; future platform work should be introduced through a new explicit plan.

---

## 4.1 — Local CLI

Status: ✅ Complete

### Commands

```text
npm run review:local -- review
npm run review:local -- review --diff
npm run review:local -- review --file <path>
npm run review:local -- rules
npm run review:local -- init
```

### Scope

- `review` discovers supported source files in the current workspace.
- `review --diff` reviews source files changed in the local Git working tree relative to `HEAD`.
- `review --file <path>` reviews one source file or recursively reviews a directory.
- `rules` documents the deterministic rule families active in the current review pipeline.
- `init` creates the minimal `.ai-reviewer.json` configuration contract.
- CLI execution delegates to `reviewFiles()`; it must not duplicate analyzer or scoring behavior.
- Local discovery ignores generated/dependency directories such as `.git`, `node_modules`, `dist`, and `coverage`.
- A failing review decision returns exit code `1`; invalid CLI usage or I/O errors return exit code `2`.

### Implementation

- `src/cli/args.ts` — pure argument parsing.
- `src/cli/files.ts` — local workspace, path, and Git-diff source collection.
- `src/cli/run.ts` — command orchestration and terminal formatting.
- `scripts/ai-reviewer.ts` — process adapter.
- `src/cli/__tests__/args.test.ts` — parser contract tests.

### Acceptance Criteria

- No new runtime dependency.
- Existing deterministic review pipeline remains the source of findings, score, and decision.
- CLI parser is independently testable.
- Commands provide stable non-zero exit codes for CI/local automation.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.

---

## 4.2 — Configuration & Rule Selection

Status: ✅ Complete

Define a typed/versioned `.ai-reviewer.json`, deterministic defaults, include/exclude behavior, rule selection, severity/profile overrides, and shared configuration semantics across adapters.

[Detailed plan](./4.2-configuration-rule-selection.md)

---

## 4.3 — Distributable CLI

Status: ✅ Complete

Turn the proven repository-local CLI into a stable executable/package surface with deterministic help/version behavior, JSON output, package exports, and packed-artifact validation.

[Detailed plan](./4.3-distributable-cli.md)

---

## 4.4 — CI Adapters & Portable Review Output

Status: ✅ Complete

Define portable CI result contracts, reusable GitHub Actions integration, JSON/SARIF formatters, stable CI exit behavior, and clear separation between analysis failures and publication failures.

[Detailed plan](./4.4-ci-adapters.md)

---

## 4.5 — Platform API Boundary

Status: ✅ Complete

Introduces explicit V1 transport-neutral request/result contracts, injected platform ports, safe source mapping, and an application review service that delegates to the existing review use cases without selecting a network framework.

The implementation is validated by CI across TypeScript, lint, coverage tests, production build, dependency/security gates, and Playwright E2E.

[Detailed plan](./4.5-platform-api-boundary.md)

---

## 4.6 — Persistence & Review History

Status: ✅ Complete

Introduces schema-versioned review-run snapshots, application-owned persistence ports, deterministic historical finding identity/matching, source-data minimization, explicit lifecycle failure behavior, repository history queries, and a minimal in-memory adapter without selecting a production database vendor.

The implementation is validated by CI across TypeScript, lint, coverage tests, production build, dependency/security gates, and Playwright E2E.

[Detailed plan](./4.6-persistence-review-history.md)

---

## 4.7 — Observability & Operational Diagnostics

Status: ✅ Complete

Introduces vendor-neutral operational telemetry contracts, resilient/no-op sinks, structured stage timing, safe optional AI usage metadata, stable diagnostic categories, sanitized developer diagnostics, and platform/review instrumentation without adding logging to domain/analyzer code.

The implementation is validated by CI across TypeScript, lint, coverage tests, production build, dependency/security gates, and Playwright E2E.

[Detailed plan](./4.7-observability.md)

---

## 4.8 — Organization Platform & Policy Governance

Status: ✅ Complete

Introduces versioned organization policy contracts, deterministic built-in → organization → repository → invocation precedence, explicit repository/invocation override permissions, mandatory security/AI governance controls, typed provenance, historical policy context, and a governed platform façade that delegates to the existing platform review service.

The implementation is validated by CI across TypeScript, lint, coverage tests, production build, dependency/security gates, and Playwright E2E.

[Detailed plan](./4.8-organization-platform.md)

---

## Phase 4 Completion Criteria

Phase 4 is complete when:

- [x] local and distributable CLI paths use the same application review pipeline
- [x] configuration/rule selection semantics are typed, versioned, deterministic, and shared across adapters
- [x] CI execution has stable portable result/output contracts
- [x] a transport-neutral platform API boundary exists without framework coupling
- [x] review history can be persisted through application ports with policy/configuration provenance
- [x] review execution exposes sanitized vendor-neutral operational telemetry
- [x] organization policy resolution is deterministic and cannot silently weaken mandatory gates
- [x] no completed platform adapter duplicates analyzer, scoring, decision, AI orchestration, or quality-gate logic
- [x] completed Phase 4 work continues to satisfy R1 dependency-boundary rules
- [x] all Phase 4 sub-plan acceptance criteria are complete
- [x] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass

---

## Out of Scope for Phase 4

Unless a future explicit plan extends Phase 4, the following remain outside current scope:

- billing/subscriptions
- enterprise SSO
- full RBAC
- GitHub Marketplace installation UX
- hosted dashboard implementation
- arbitrary plugin marketplace/distribution service
- autonomous code mutation/remediation
- model training/fine-tuning infrastructure

These should be planned only after the platform contracts in Phase 4 are stable.
