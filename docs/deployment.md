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

Required workflow permissions:

- `contents: read`
- `pull-requests: write`
- `checks: write`

Environment supplied to the review command includes `GITHUB_TOKEN`, `AI_API_KEY`, `GITHUB_REPOSITORY`, `PR_NUMBER`, and `HEAD_SHA`. Secret values are sourced through GitHub Actions secrets/context and must never be committed.

## Not currently implemented

- Docker image/build configuration;
- Kubernetes or cloud infrastructure configuration;
- release publishing workflow;
- database migrations;
- production monitoring/telemetry deployment;
- a documented hosted web-app target.

These should remain documented as absent until implementation evidence exists.
