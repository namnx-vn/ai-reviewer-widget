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

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` using Node 22, then executes install, typecheck, lint, test, and build. `.github/workflows/ai-review.yml` executes the same validation sequence before running the PR reviewer.

## Current limitations

No repository-wide enforced coverage percentage was identified. Do not claim a coverage threshold until configuration or CI explicitly enforces one.
