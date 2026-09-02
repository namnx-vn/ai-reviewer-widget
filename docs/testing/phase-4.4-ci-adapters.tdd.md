# Phase 4.4 CI Adapters — TDD Evidence

## Source plan

- [`plans/phase-4/4.4-ci-adapters.md`](../../plans/phase-4/4.4-ci-adapters.md)
- Scope was limited to portable CI output, JSON/SARIF formatting, GitHub analysis/publication staging, the process adapter, and GitHub Actions artifact wiring.

## User journeys

1. As a CI operator, I receive a stable, versioned result and predictable exit classification without parsing terminal text.
2. As a repository maintainer, I receive faithful JSON and SARIF artifacts with safe repository-relative locations.
3. As an integration operator, I can distinguish analysis failure, review failure, and publication failure while retaining a completed review after publication failure.
4. As a GitHub Actions user, I use the existing application/GitHub pipeline and receive artifacts and a step summary even when the review step fails.

## RED → GREEN evidence

No RED/GREEN checkpoint commits were created because the request to commit arrived after the TDD cycle. This evidence preserves the sequence in the final Phase 4.4 commit.

| Stage | Command | Result | Evidence |
|---|---|---|---|
| RED | `npm test -- src/ci/__tests__ src/github/__tests__/review-pull-request.test.ts` | Expected failure | Three missing CI modules failed to resolve and `analyzeGitHubPullRequest` was not implemented; existing GitHub tests remained green. |
| GREEN | `npm test -- src/ci/__tests__ src/github/__tests__/review-pull-request.test.ts src/cli/__tests__/output-format.test.ts` | PASS | 7 files, 12 tests passed after the minimal implementation. |
| Remediation RED | `npm test -- src/ci/__tests__/publication.test.ts src/ci/__tests__/sarif.test.ts src/ci/__tests__/workflow.test.ts` | Expected failure | Publication adapter was missing, SARIF positions were not normalized, and the workflow lacked the guarded upload condition. |
| Remediation GREEN | `npm test -- src/ci/__tests__/publication.test.ts src/ci/__tests__/sarif.test.ts src/ci/__tests__/workflow.test.ts` | PASS | 3 files, 6 tests passed after writer-failure classification, position validation, and workflow hardening. |
| Full suite | `npm test` | PASS | Full-suite result recorded in Validation below. |

## Test specification

| # | Guarantee | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Domain decisions map to CI status and exit codes `0/1`; warnings and security quality-gate data are retained. | `src/ci/__tests__/execution.test.ts` | Unit | PASS |
| 2 | Analysis and publication failures are distinct, use exit code `2`, expose sanitized operational messages, and publication failures retain the completed review. | `src/ci/__tests__/execution.test.ts` | Unit | PASS |
| 3 | SARIF 2.1.0 has unique rules, severity levels, finding properties, encoded repository-relative URIs, and omits unsafe traversal locations. | `src/ci/__tests__/sarif.test.ts` | Unit | PASS |
| 4 | Artifact names are fixed and JSON, SARIF, and Markdown summary contents are produced from the same CI execution result. | `src/ci/__tests__/artifacts.test.ts` | Unit | PASS |
| 5 | GitHub output contains only fixed single-line keys and enum/path values, never operational error content. | `src/ci/__tests__/github-actions.test.ts` | Unit | PASS |
| 6 | Artifact, GitHub output, and step-summary writer failures become sanitized `publication_failed` results retaining completed review data; an existing `analysis_failed` remains the primary classification. | `src/ci/__tests__/publication.test.ts` | Unit | PASS |
| 7 | GitHub PR analysis performs no publication; the separate publication stage and compatibility wrapper publish the existing Check Run and inline review outputs. | `src/github/__tests__/review-pull-request.test.ts` | Integration | PASS |
| 8 | The workflow keeps checkout external, runs the shared adapter, guards artifact upload when review was not skipped, and warns rather than obscuring the original result when files are absent. | `src/ci/__tests__/workflow.test.ts` | Contract | PASS |
| 9 | CLI JSON delegates to the shared portable review schema without changing Phase 4.3 output. | `src/cli/__tests__/output-format.test.ts` | Compatibility | PASS |

## Validation

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 115 files, 776 tests |
| `npm run test:coverage` | PASS — statements 86.58%, branches 77.56%, functions 95.40%, lines 87.67%; Phase 4.4 `src/ci` statements/functions/lines 100%, branches 97.10% |
| `npm run build` | PASS |
| `npm run security:secrets` | PASS — no committed credential patterns found |
| `git diff --check` | PASS |

## Known gaps and risks

- Global branch coverage remains 77.56%; statements, functions, and lines exceed 80%. This is an existing repository-wide coverage shape rather than a Phase 4.4 regression.
- The workflow produces SARIF as a portable artifact but does not upload it to GitHub code scanning; that integration remains optional in the phase plan.
- If analysis and artifact publication both fail, `analysis_failed` deliberately takes precedence because no completed review exists to retain. Writer errors are still swallowed and never replace or leak into the primary sanitized analysis error.
- When a writer failure changes a completed execution to `publication_failed`, the adapter makes one best-effort rewrite of the JSON artifact. If the JSON writer itself remains unavailable, the process still logs the stable final status and exits with code `2`; it does not recurse or expose the raw Node error.
