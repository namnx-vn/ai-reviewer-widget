# Project Overview

## Purpose

AI Reviewer Widget is a TypeScript code-review platform that combines deterministic source analysis with optional AI reasoning and GitHub pull-request automation. Its core design goal is to produce review findings that are explainable, typed, and normalized before they are surfaced through GitHub or the browser UI.

## Problems addressed

The repository currently targets several review problems:

- detecting source-level issues through AST rules;
- detecting architectural violations independently of an LLM;
- applying React-specific semantic rules;
- checking micro-frontend boundaries;
- detecting security issues with rule-based and taint-flow analysis;
- enriching deterministic findings with AI review;
- aggregating findings into a score and review decision;
- publishing review output to GitHub pull requests and Check Runs.

## Main actors

### Contributor / reviewer

Runs local quality commands, adds rules or engine behavior, and can execute the PR-review workflow locally when required environment variables are available.

### GitHub Actions

On pull-request events, installs dependencies, validates the repository, and runs `npm run review:pr`. The review script retrieves PR metadata/files, analyzes reviewable source, creates a Check Run, and creates a PR review containing findings that map to changed lines.

### Browser user

Can view the current demo review UI. `src/ui/App.tsx` composes a static fixture
with presentation components; there is no implemented live browser-to-GitHub
review workflow.

## Current modules

| Module | Responsibility |
| --- | --- |
| `src/analyzer/ast/` | Parsing and generic AST-oriented analysis. |
| `src/analyzer/composition/` | Ordered built-in/plugin analyzer contributions and immutable registry. |
| `src/analyzer/architecture/` | Deterministic architecture checks. |
| `src/analyzer/security/` | Security engine, rules, taint flow, interprocedural analysis, supply-chain analysis, compliance, policies, and quality gates. |
| `src/react/` | React semantic analysis and React/Next.js-specific rules. |
| `src/mfe/` | Micro-frontend intelligence and boundary analysis. |
| `src/ai/` | AI-provider abstraction, prompt/input handling, parsing and normalization. |
| `src/domain/review/` | Pure review contracts, scoring, decisions, and aggregation. |
| `src/application/review/` | Review use cases, ports, and default composition. |
| `src/engine/` | Finding normalization, merge, confidence, severity, deduplication, and optional AI execution. |
| `src/review/` | Compatibility exports for established review APIs. |
| `src/github/` | GitHub PR retrieval, diff utilities, comments/reviews, and Check Runs. |
| `src/plugins/` | Typed extension registry and shared-pipeline plugin composition. |
| `src/ui/` | Browser demo fixture and presentation components. |
| `src/components/` | Compatibility exports for UI components. |
| `scripts/review-pr.ts` | Executable GitHub PR review workflow. |

## Current scope

The repository supports JavaScript/TypeScript-family source review and contains React-specific analysis for JSX/TSX. The PR script recognizes `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs` files, and excludes deleted files.

Security analysis is implemented as a first-class analyzer subsystem rather than as AI-only prompting. Its public exports include deterministic security rules, taint flow, supply-chain analysis, security profiles, compliance mappings, and security quality-gate functions.

## External integrations

### GitHub

`@octokit/rest` is used behind the `src/github/` boundary. The GitHub Actions review workflow grants read access to repository contents and write access to pull requests and checks.

### AI provider

The PR workflow creates an AI provider from environment configuration. The provider is optional at the `reviewPullRequest` API boundary, so deterministic review can exist independently from AI output.

## Explicitly outside current implemented scope

The following are not confirmed as implemented current behavior:

- a production backend service or persistent database;
- user authentication for the browser UI;
- a live browser dashboard connected to GitHub;
- a standalone deployment target for the web app beyond Vite build output;

## Source of truth

`AGENTS.md` is the engineering contract for contributors and agents. `plans/` records roadmap intent. Current behavior must be verified against source and tests; a plan marked complete is supporting evidence, not a substitute for implementation inspection.
