# Testing

## Test stack

- Vitest for unit/integration tests.
- `@vitest/coverage-v8` for coverage.
- Playwright for browser end-to-end tests.
- ESLint and TypeScript checks are part of the quality gate even though they are not test runners.

## Commands

```bash
npm test
npm run test:watch
npm run test:coverage
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

## Repository expectations

Tests should be added or updated with behavior changes and grouped by domain. Existing coverage spans analyzer, engine, GitHub, review, React, architecture, security, and browser behavior.

For analyzer/rule work, include positive and negative fixtures and verify normalized finding fields. For orchestration changes, verify merged findings, warnings, score/decision behavior, and optional AI paths. For GitHub integration changes, isolate API behavior and changed-line handling. For UI changes, use Playwright where browser rendering or interaction matters.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` using Node 22. Its quality job executes dependency auditing at high severity, repository secret scanning, SBOM generation from `package-lock.json`, typecheck, lint, unit/integration tests with coverage, and build. A separate job installs Chromium and runs the Playwright end-to-end suite. `.github/workflows/ai-review.yml` validates the project before running the PR reviewer.

## Coverage gate

CI enforces repository-wide minimums of 80% for functions, lines, and statements, plus a 77% branch-coverage ratchet over the source domains included in `vite.config.ts`. The branch ratchet reflects the current 77.27% baseline and must move upward to 80%; lowering it is not permitted. New source domains should be added to the coverage include list when they become production boundaries.
