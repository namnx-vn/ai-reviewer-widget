# GitHub Integration

## Purpose

GitHub is the operational integration boundary for automated pull-request reviews. GitHub-specific behavior lives under `src/github/` and is orchestrated by `scripts/review-pr.ts`.

## Pull-request review flow

1. Read `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `PR_NUMBER` from the environment.
2. Create `GitHubClient` and fetch PR metadata/files.
3. Ignore deleted files and files outside the supported JS/TS-family extensions.
4. Fetch source content at the PR head SHA.
5. Execute `reviewPullRequest` with the PR title, description, and files.
6. Compute changed lines from file patches.
7. Restrict inline findings to changed lines.
8. Create a GitHub Check Run from the full review result.
9. Create a pull-request review from inline findings.

## Supported source extensions in the PR script

```text
.ts .tsx .mts .cts .js .jsx .mjs .cjs
```

Deleted files are excluded.

## GitHub Actions permissions

The AI review workflow uses:

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

It runs for pull-request `opened`, `synchronize`, and `reopened` events and uses a per-PR concurrency group with cancellation of obsolete runs.

## Environment

- `GITHUB_TOKEN`: GitHub API authentication.
- `GITHUB_REPOSITORY`: `owner/repo` repository selector.
- `PR_NUMBER`: positive integer PR number.
- `AI_API_KEY`: AI-provider credential used by the workflow/provider factory.
- `HEAD_SHA`: supplied by the workflow; the current script independently obtains the PR head SHA from GitHub.

## Boundary rules

Analyzer, engine, review-domain, and UI modules should not directly manipulate GitHub resources. Keep Octokit/API details behind `src/github/` and executable orchestration.

## Limitations

- Inline review output is restricted to findings that map to changed lines.
- Non-JS/TS-family files are not fetched for review by the current PR script.
- The browser demo does not invoke this integration.
