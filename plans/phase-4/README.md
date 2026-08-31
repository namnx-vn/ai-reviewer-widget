# Phase 4 — Platform

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: 🚧 In Progress

---

## Objective

Transform the core review engine into a complete developer platform while keeping deterministic analysis and review-domain boundaries reusable outside the UI and GitHub integration.

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

## Remaining Phase 4 Areas

Further platform work should be split into dedicated plans before implementation. Candidate areas include distributable CLI packaging, configuration/rule selection, CI adapters, hosted API boundaries, persistence, and organization-level platform capabilities.
