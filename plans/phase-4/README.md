# Phase 4 — Platform

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: 🚧 In Progress

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
| 4.4 | 📌 Next | CI Adapters & Portable Review Output | [4.4](./4.4-ci-adapters.md) |
| 4.5 | ⏳ Planned | Platform API Boundary | [4.5](./4.5-platform-api-boundary.md) |
| 4.6 | ⏳ Planned | Persistence & Review History | [4.6](./4.6-persistence-review-history.md) |
| 4.7 | ⏳ Planned | Observability & Operational Diagnostics | [4.7](./4.7-observability.md) |
| 4.8 | ⏳ Planned | Organization Platform & Policy Governance | [4.8](./4.8-organization-platform.md) |

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
4.4 CI Adapters              │
                             │
4.5 Platform API Boundary ◀──┘
       ↓              ↓
4.6 Persistence   4.7 Observability
       └──────┬───────┘
              ↓
4.8 Organization Platform
```

Notes:

- 4.5 may begin after 4.2 once configuration semantics are stable; it does not need to wait for every CLI/CI packaging detail.
- 4.6 and 4.7 may progress in parallel after the platform API/application boundary is stable.
- 4.8 should remain last because organization governance depends on stable configuration, platform contracts, and persisted policy provenance.

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

Status: 📌 Next

Define portable CI result contracts, reusable GitHub Actions integration, JSON/SARIF formatters, stable CI exit behavior, and clear separation between analysis failures and publication failures.

[Detailed plan](./4.4-ci-adapters.md)

---

## 4.5 — Platform API Boundary

Status: ⏳ Planned

Introduce transport-neutral request/result contracts and application ports so future hosted/network adapters can invoke the same review use cases without selecting a server framework prematurely.

[Detailed plan](./4.5-platform-api-boundary.md)

---

## 4.6 — Persistence & Review History

Status: ⏳ Planned

Define versioned review-run snapshots, persistence ports, deterministic historical finding identity/matching policy, configuration provenance, and strict source-data minimization before selecting a storage vendor.

[Detailed plan](./4.6-persistence-review-history.md)

---

## 4.7 — Observability & Operational Diagnostics

Status: ⏳ Planned

Add vendor-neutral telemetry ports, pipeline timing, AI usage diagnostics, stable operational failure categories, and sanitized developer diagnostics without changing review decisions.

[Detailed plan](./4.7-observability.md)

---

## 4.8 — Organization Platform & Policy Governance

Status: ⏳ Planned

Define organization/repository policy contracts, deterministic policy precedence, mandatory gate controls, configuration provenance, and historical policy snapshots while keeping provider identity and tenancy concerns in adapters.

[Detailed plan](./4.8-organization-platform.md)

---

## Phase 4 Completion Criteria

Phase 4 is complete when:

- [x] local and distributable CLI paths use the same application review pipeline
- [x] configuration/rule selection semantics are typed, versioned, deterministic, and shared across adapters
- [ ] CI execution has stable portable result/output contracts
- [ ] a transport-neutral platform API boundary exists without framework coupling
- [ ] review history can be persisted through application ports with policy/configuration provenance
- [ ] review execution exposes sanitized vendor-neutral operational telemetry
- [ ] organization policy resolution is deterministic and cannot silently weaken mandatory gates
- [ ] no adapter duplicates analyzer, scoring, decision, AI orchestration, or quality-gate logic
- [ ] dependency boundaries continue to satisfy R1 architecture rules
- [ ] all Phase 4 sub-plan acceptance criteria are complete
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass

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
