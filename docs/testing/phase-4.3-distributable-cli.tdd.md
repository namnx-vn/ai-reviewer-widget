# Phase 4.3 Distributable CLI TDD Evidence

Source plan: [`../../plans/phase-4/4.3-distributable-cli.md`](../../plans/phase-4/4.3-distributable-cli.md)

## User journeys

- As a developer, I can invoke one packaged `ai-reviewer` executable with deterministic help and version output.
- As an automation author, I can select text or a versioned JSON review contract without parsing terminal strings.
- As a repository maintainer, I can pack and invoke the artifact while keeping source, tests, scripts, and plans out of it.
- As a CLI user, config discovery, file/diff review, the shared application pipeline, and exit codes behave the same after packaging.

## RED and GREEN report

| Task | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Parse version and output format | `npm test -- src/cli/__tests__/args.test.ts src/cli/__tests__/output-format.test.ts src/cli/__tests__/run.test.ts` failed with 8 intended assertions plus the missing `output-format` module. | The focused CLI suite passed after the empty-JSON RED/GREEN follow-up: 3 files, 19 tests. | `--version`, `-v`, and `--format text|json` are explicit typed arguments; invalid formats return usage error semantics. |
| Versioned JSON output | The focused RED run failed because JSON formatting and adapter selection did not exist. | `src/cli/__tests__/output-format.test.ts` and `run.test.ts` passed. | JSON has `schemaVersion: 1`, review-domain fields, a trailing newline, and intentionally omits non-deterministic `durationMs`. |
| Publishable package contract | `vitest run --config vite.package-test.config.ts` failed at the intended `private: true` assertion before packing. | `npm run test:package` passed after the CLI build was added; direct packed executable tests passed for help/version, config + file JSON review, diff review, and exit codes. | One ESM/shebang executable is exposed through `bin`; package exports expose metadata only, while the packed CLI invokes the existing `runCli` adapter and shared `reviewFiles` use case. |
| Node-only packed artifact | The first packed invocation failed because the library build browser-externalized Node modules; the direct-executable check then exposed missing executable permissions. | The Node SSR bundle passed direct invocation after Node built-ins, ESM filename compatibility, executable mode, and public-directory exclusion were configured. | Runtime does not import the Vite/browser entry point and the packed file is executable without `tsx`. |
| Reviewer package-surface hardening | The reviewer RED run failed because root `exports` pointed to the process executable. | The package suite passed 5 tests after exporting only `./package.json`; a package-root import now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` and produces no stdout. | Importing the package cannot execute CLI process side effects or expose internal JS modules. |
| Deterministic filesystem traversal | `npm test -- src/cli/__tests__/files.test.ts` failed because `sortDirectoryEntries` did not exist. | The same target passed 2 tests after immutable binary name sorting was applied before recursive traversal. | File and finding order does not depend on filesystem creation/readdir order. |

No TDD checkpoint commits were created because task ownership explicitly prohibited commits; this document preserves the RED/GREEN sequence.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Workspace, file, and diff targets default to text and accept explicit text/JSON format. | `src/cli/__tests__/args.test.ts` | Unit | PASS |
| 2 | JSON schema is versioned and derived from `ReviewResult`. | `src/cli/__tests__/output-format.test.ts` | Unit | PASS |
| 3 | CLI selects JSON/text, discovers config, delegates review, and preserves `0/1/2` semantics. | `src/cli/__tests__/run.test.ts` | Integration | PASS |
| 4 | Tarball executable handles help/version, config/file JSON, diff, and failing decisions. | `package-tests/cli-package.test.ts` | Packed artifact | PASS |
| 5 | Tarball excludes `src`, `scripts`, `plans`, `package-tests`, and `__tests__`. | `package-tests/cli-package.test.ts` | Package boundary | PASS |
| 6 | Package-root imports are blocked without executing the process adapter. | `package-tests/cli-package.test.ts` | Package boundary | PASS |
| 7 | Packed config disables security findings and invalid usage exits `2`. | `package-tests/cli-package.test.ts` | Packed artifact | PASS |
| 8 | Files and findings are ordered by normalized deterministic traversal. | `src/cli/__tests__/files.test.ts` | Unit/integration | PASS |

## Validation

- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm test` — PASS, 103 files / 739 tests.
- `npm run build` — PASS; UI build and Node CLI bundle both completed.
- `npm run test:package` — PASS, 1 file / 5 packed-artifact tests.
- `npm run security:secrets` — PASS outside the restricted sandbox (tsx required a temporary IPC socket); no committed credential patterns found.
- `npm run test:coverage` — PASS: statements 86.56%, branches 77.47%, functions 95.45%, lines 87.67%. The repository ratchets legacy branch coverage at 77%; the other global metrics exceed 80%. CLI coverage is 91.75% statements, 87.50% branches, 84.61% functions, and 92.47% lines.
- `npm pack --dry-run --json --cache /private/tmp/ai-reviewer-phase43-cache` — PASS: four files only (`LICENSE`, `README.md`, `dist/cli/ai-reviewer.js`, `package.json`); executable mode `0755`; packed size 1,846,743 bytes.

## Assumptions and known gaps

- Version `0.1.0` establishes the first distributable CLI contract; future breaking CLI/JSON changes require normal semantic versioning and a JSON schema-version change.
- `private: true` was removed because npm refuses publication of private packages. No dependency was added.
- The self-contained Node bundle is about 11.2 MB unpacked because deterministic parsing is included. Optimizing artifact size is outside this phase and must not trade away reproducible packed execution.
- Registry publication and global installation are intentionally not performed; they are outside the plan and require an external write approval.
