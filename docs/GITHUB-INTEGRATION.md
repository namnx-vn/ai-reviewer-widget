# GitHub Integration

## Purpose

GitHub is the operational integration boundary for automated pull-request
reviews. GitHub-specific behavior lives under `src/github/` and is orchestrated
by the injected adapter in `src/github/review-pull-request.ts`.

## Pull-request review flow

1. Read `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `PR_NUMBER` from the environment.
2. The executable script constructs `GitHubClient`, application use cases, and
   the optional AI adapter.
3. `analyzeGitHubPullRequest` fetches PR metadata, ignores deleted/unsupported
   files, and loads head content plus base content for modified files.
4. The adapter converts files to application `SourceFile` contracts and calls
   `reviewPullRequest` with the security quality-gate configuration.
5. Changed lines are computed from patches and inline findings are restricted
   to those lines.
6. `publishGitHubPullRequestReview` creates a Check Run from the full result and
   a PR review from inline findings. `reviewGitHubPullRequest` remains the
   compatibility wrapper that executes both stages.
7. The CI adapter writes versioned JSON, SARIF, and summary artifacts while
   classifying analysis, review-decision, and publication failures separately.

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

Analyzer, engine, domain, application use cases, and UI modules do not directly
manipulate GitHub resources. Keep Octokit/API details behind `src/github/`;
executable scripts remain thin process adapters.

## Limitations

- Inline review output is restricted to findings that map to changed lines.
- Non-JS/TS-family files are not fetched for review by the current PR script.
- The browser demo does not invoke this integration.
