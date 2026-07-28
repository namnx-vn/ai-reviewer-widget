# AI Reviewer Widget

AI Reviewer Widget is an AI-assisted code review platform that combines deterministic static analysis with optional LLM review and GitHub pull-request automation. The repository is intentionally structured as more than an LLM wrapper: deterministic AST, architecture, React, micro-frontend, and security analysis run before AI findings are merged into a normalized review result.

## Status

Implemented roadmap coverage currently reaches **Phase 3.6 — Security Intelligence**. Phase 3.7 (Performance Intelligence) and Phase 3.8 (Plugin SDK) remain planned in `plans/`.

The browser UI is currently a **demo presentation surface** backed by a static `ReviewResult`; the operational review workflow is the CLI/GitHub Actions path through `scripts/review-pr.ts`.

## Current capabilities

- TypeScript/JavaScript AST parsing and deterministic rules.
- Architecture analysis and micro-frontend boundary checks.
- React intelligence for hooks, rendering, state, performance, context, patterns, Next.js App Router/RSC, integration, and hardening.
- Security analysis with rule registry/engine, taint-flow analysis, interprocedural analysis, supply-chain analysis, compliance mapping, security profiles, and quality gates.
- Optional AI review through a provider abstraction with normalized findings.
- Review aggregation, deduplication/scoring/decision orchestration.
- GitHub pull-request retrieval, changed-line filtering, Check Runs, and PR review output.
- Vitest unit/integration tests and Playwright end-to-end tests.

## Technology stack

- Node.js 22+, npm, TypeScript, ES modules
- React 18, React DOM 18, Vite, `@vitejs/plugin-react-swc`
- Ant Design, styled-components, Framer Motion, lucide-react
- `@typescript-eslint/typescript-estree` for AST analysis
- `@octokit/rest` for GitHub integration
- Vitest, Playwright, ESLint
- `tsx` for repository scripts

## Prerequisites

- Node.js 22 or newer
- npm

GitHub/AI review execution additionally requires the environment variables documented in [Getting started](docs/getting-started.md).

## Quick start

```bash
npm install
npm run dev
```

Quality validation:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Additional commands:

```bash
npm run test:coverage
npm run test:e2e
npm run test:watch
npm run review:pr
```

## High-level structure

```text
src/
  ai/          AI provider, prompt, parsing, normalization
  analyzer/    AST, architecture, and security analysis
  components/  Browser presentation components
  engine/      Review orchestration
  github/      GitHub PR/diff/check/review integration
  mfe/         Micro-frontend intelligence
  react/       React-specific semantic analysis and rules
  review/      Review domain models, aggregation, reviewer pipeline
scripts/       Executable repository workflows such as review-pr.ts
e2e/           Playwright tests
docs/          Current-state documentation
plans/         Phase plans and roadmap
```

## Current limitations

- The browser dashboard is not wired to a live review session; it displays static demo data.
- `review:pr` is focused on JavaScript/TypeScript-family source files and skips deleted files.
- Deterministic parsing failures are reported as warnings and that file is skipped for deterministic analysis.
- Deployment of a standalone hosted product is not defined in this repository; current automation is GitHub Actions based.
- Roadmap status is documented separately from verified current behavior; see the phase audit for evidence and caveats.

## Documentation

- [Project overview](docs/project-overview.md)
- [Implementation phases](docs/implementation-phases.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Review pipeline](docs/REVIEW-PIPELINE.md)
- [GitHub integration](docs/GITHUB-INTEGRATION.md)
- [Getting started](docs/getting-started.md)
- [Development guidelines](docs/development-guidelines.md)
- [Testing](docs/testing.md)
- [Deployment and automation](docs/deployment.md)
- [ADR-001: deterministic analysis first](docs/ADR-001-deterministic-first.md)

For AI coding agents, [`AGENTS.md`](AGENTS.md) is the canonical engineering contract and must be read before making changes.
