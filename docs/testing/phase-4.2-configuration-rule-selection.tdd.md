# Phase 4.2 Configuration & Rule Selection TDD Evidence

Source plan: `plans/phase-4/4.2-configuration-rule-selection.md`

## User Journeys

- As a CLI user, I want missing `.ai-reviewer.json` to resolve to documented defaults so reviews are deterministic without setup.
- As a repository maintainer, I want invalid config and unknown stable rule IDs to fail with stable diagnostics so broken policy does not silently pass.
- As an adapter author, I want CLI, GitHub, and plugin composition to consume one resolved configuration model so adapters do not fork review behavior.
- As a reviewer, I want include/exclude patterns, rule-family selection, rule-ID disabling, profiles, and severity overrides to change findings before scoring.

## RED/GREEN Evidence

| # | Guarantee | Test target | RED evidence | GREEN evidence |
|---|---|---|---|---|
| 1 | Config defaults, diagnostics, profiles, and glob matching are typed and deterministic. | `src/config/__tests__/review-configuration.test.ts` | Added before implementation; config module did not satisfy resolver contract. | Focused run passed in the Phase 4.2 suite. |
| 2 | Analyzer composition filters disabled contribution/rule IDs and applies severity overrides without changing ordering. | `src/analyzer/__tests__/composition.test.ts` | `npm test -- src/config/__tests__/review-configuration.test.ts src/analyzer/__tests__/composition.test.ts src/cli/__tests__/run.test.ts` failed on composition selection. | Focused suite passed after adding `AnalyzerSelection`. |
| 3 | CLI rejects invalid config, applies path filtering, and keeps quality/security family semantics independent. | `src/cli/__tests__/run.test.ts` | Same RED run failed invalid config and path/rule selection cases. | Focused CLI/composition run passed after loader and family split. |
| 4 | GitHub adapter applies repository path selection before fetching PR file content. | `src/github/__tests__/review-pull-request.test.ts` | `npm test -- src/github/__tests__/review-pull-request.test.ts` failed because excluded `src/new.tsx` was loaded. | Focused Phase 4.2 suite passed after adapter filtering. |
| 5 | Plugin-aware review composition exposes plugin rule IDs and uses the shared application pipeline. | `src/plugins/__tests__/registry.test.ts` | Covered by existing plugin integration tests extended with catalog behavior. | Focused Phase 4.2 suite passed. |

## Validation

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS, 101 test files and 730 tests
- `npm run build`: PASS
- `npm run test:coverage`: PASS, statements 86.54%, branches 77.44%, functions 95.44%, lines 87.65%

Known gap: global branch coverage remains below 80% at 77.44%. The coverage command has no failing threshold and the gap is repository-wide, not specific to the Phase 4.2 files.
