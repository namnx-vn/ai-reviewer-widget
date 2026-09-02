# Deployment and Automation

## Current deployment status

The repository has a Vite production build but no confirmed standalone hosting, container, infrastructure-as-code, or database deployment configuration. Do not treat a hosting platform as part of the current architecture unless it is added to the repository.

## Production build

```bash
npm run build
```

This executes TypeScript project compilation followed by Vite production bundling.

## CI workflow

`.github/workflows/ci.yml` runs for pull requests and pushes to `main`. It uses Node 22 and executes:

```text
npm ci
npx tsc --noEmit
npm run lint
npm test
npm run build
```

The workflow has read-only repository contents permission.

## AI review workflow

`.github/workflows/ai-review.yml` runs when pull requests are opened, synchronized, or reopened. It cancels older in-progress reviews for the same PR, validates the repository, then runs `npm run review:pr`.

The review step writes a versioned JSON result, SARIF 2.1.0, and a Markdown
summary under `ai-reviewer-artifacts/`. GitHub Actions uploads that directory
even when the completed review fails. The process uses exit `0` for PASS/WARN,
`1` for a failing review decision, and `2` for analysis or publication failure;
the JSON status distinguishes those operational failure stages.

Required workflow permissions:

- `contents: read`
- `pull-requests: write`
- `checks: write`

Environment supplied to the review command includes `GITHUB_TOKEN`, `AI_API_KEY`, `GITHUB_REPOSITORY`, `PR_NUMBER`, and `HEAD_SHA`. Secret values are sourced through GitHub Actions secrets/context and must never be committed.

The workflow checks out the trusted PR base revision before running the reviewer. PR head source is retrieved through the GitHub API and is never executed by the privileged review job.

Banking quality-gate configuration:

- `SECURITY_GATE_PROFILE` defaults to `security/banking`.
- `SECURITY_GATE_BASELINE_IDS` accepts comma-separated stable finding IDs for explicitly adopted debt.
- `SECURITY_GATE_SUPPRESSIONS_JSON` accepts audited suppressions with a finding or rule target, reason, optional owner, and optional expiry.
- Findings outside changed lines are automatically treated as existing debt; findings on changed lines remain new.

AI data-governance configuration:

- Only GitHub patch data is sent to the provider; files without patches are omitted.
- Credential-like values are redacted and the payload is bounded before transmission.
- `AI_TIMEOUT_MS` is constrained to 1–120 seconds and defaults to 15 seconds.
- Custom `AI_BASE_URL` values must use HTTPS and be explicitly listed in `AI_ALLOWED_BASE_URLS`.

## Not currently implemented

- Docker image/build configuration;
- Kubernetes or cloud infrastructure configuration;
- release publishing workflow;
- database migrations;
- production monitoring/telemetry deployment;
- a documented hosted web-app target.

These should remain documented as absent until implementation evidence exists.
