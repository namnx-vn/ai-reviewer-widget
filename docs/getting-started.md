# Getting Started

## Prerequisites

- Node.js 22+
- npm
- Git, for normal repository workflows

## Install

```bash
npm install
```

CI uses `npm ci` against the committed lockfile.

## Run the browser app

```bash
npm run dev
```

Vite prints the local development URL. The current browser app is a demo review dashboard backed by static data in `src/App.tsx`.

## Validate a local checkout

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Optional suites:

```bash
npm run test:coverage
npm run test:e2e
```

## PR review environment

`npm run review:pr` requires:

| Variable | Purpose | Safe example |
| --- | --- | --- |
| `GITHUB_TOKEN` | Authenticate GitHub API operations. | `github-token-from-environment` |
| `GITHUB_REPOSITORY` | Repository in `owner/repo` format. | `example/example-repo` |
| `PR_NUMBER` | Positive pull-request number. | `123` |
| `AI_API_KEY` | AI-provider credential used by provider factory/workflow. | `provider-key-from-secret-store` |

GitHub Actions also supplies `HEAD_SHA`, although the current `scripts/review-pr.ts` obtains the PR head SHA from GitHub and does not directly read `HEAD_SHA`.

Never commit real credential values.

Example shell shape:

```bash
GITHUB_TOKEN=... \
GITHUB_REPOSITORY=owner/repo \
PR_NUMBER=123 \
AI_API_KEY=... \
npm run review:pr
```

## Production build

```bash
npm run build
```

The script runs `tsc -b` and then `vite build`.

## Database and migrations

None are currently required; no database implementation was identified in the audited repository.

## Confirming the application works

For the UI, start `npm run dev` and verify that the score card and demo findings render. For repository correctness, use the validation command sequence above. For GitHub review behavior, use the GitHub Actions workflow or a test repository/PR with correctly scoped credentials.

## Common setup issues

### Unsupported Node version

The repository contract and CI use Node.js 22. Upgrade Node before investigating dependency or build failures caused by an older runtime.

### Missing PR-review variables

`review:pr` fails fast when `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, or `PR_NUMBER` is missing. `GITHUB_REPOSITORY` must be `owner/repo`; `PR_NUMBER` must be a positive integer.

### Source parse warning

If a source file cannot be parsed, deterministic review skips that file and returns a `SOURCE_PARSE_FAILED` warning instead of failing the entire review.
