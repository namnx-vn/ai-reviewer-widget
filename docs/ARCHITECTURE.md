# AI Reviewer Architecture

## Overview

AI Reviewer Widget uses a layered review architecture in which deterministic analysis is executed before optional AI review and before GitHub output. Domain findings are normalized so infrastructure concerns do not leak into analyzer or UI code.

```text
GitHub PR / local files
        |
        v
Source collection + parseability checks
        |
        v
Deterministic analysis
  |-- generic AST / code rules
  |-- architecture rules
  |-- security analysis
  |-- React intelligence
  `-- micro-frontend intelligence
        |
        v
Normalized deterministic findings
        |
        +-------------------+
        | optional AI input |
        v                   v
   Review Engine <----- AI provider
        |
        v
merge / normalize / deduplicate / confidence / severity / score / decision
        |
        v
ReviewResult
   |             |
   v             v
GitHub Check   PR review

Browser UI currently renders demo ReviewResult data only.
```

## Major layers

### `src/analyzer/`

Owns deterministic source analysis. `src/analyzer/index.ts` is the generic analyzer entry point; AST, architecture, and security concerns live under dedicated subdirectories. The analyzer boundary must not call an LLM.

### `src/analyzer/security/`

A first-class security subsystem containing an engine, registry, typed security model, rule families, taint-flow analysis, interprocedural analysis, supply-chain analysis, compliance mapping, security profiles/policies, and quality-gate evaluation.

### `src/react/`

Owns React-specific semantic analysis and rule execution. `src/review/reviewer.ts` invokes the React engine only for `.tsx`/`.jsx` files. Next.js plugins are enabled when the file path matches an App Router entry pattern such as `app/**/page.tsx` or `layout.tsx`.

### `src/mfe/`

Owns micro-frontend intelligence and keeps MFE-specific architecture semantics separate from generic AST rules.

### `src/ai/`

Owns AI provider construction, prompt/input handling, parsing, validation, and AI-specific normalization. AI output is treated as external/untrusted data by the engineering contract.

### `src/engine/`

Owns review orchestration after findings exist. `ReviewEngine` coordinates deterministic findings, warnings, optional AI review, and the final review result. Provider-specific implementation should not be placed here.

### `src/review/`

Owns review-domain models and the high-level reviewer pipeline. `reviewPullRequest` collects deterministic findings and delegates final execution to `ReviewEngine`; `reviewFiles` supports deterministic local review.

### `src/github/`

Owns GitHub infrastructure: pull-request retrieval, file content, diff/changed-line handling, Check Runs, and PR reviews. GitHub calls must remain outside analyzers and UI components.

### `src/components/` and `src/App.tsx`

Own presentation. The current app is a demonstration surface and does not fetch GitHub data or invoke the analyzer pipeline.

## Dependency direction

Preferred direction follows the engineering contract:

```text
presentation
    |
application / review orchestration
    |
engine + review domain
    |
analysis/domain contracts

Infrastructure adapters: github, ai
Deterministic analyzers: analyzer, react, mfe
```

Infrastructure should be passed into orchestration rather than imported through unrelated modules. Avoid circular dependencies and avoid placing GitHub, LLM, scoring, or AST parsing logic in React components.

## Application lifecycle

### Browser lifecycle

1. Vite starts the React application through `src/main.tsx`.
2. `src/App.tsx` constructs a static demo `ReviewResult`.
3. Presentation components render score and finding cards.

No authentication, routing, server persistence, or live API state is currently confirmed in the browser path.

### Pull-request review lifecycle

1. GitHub Actions runs quality gates and executes `npm run review:pr`.
2. `scripts/review-pr.ts` validates `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `PR_NUMBER`.
3. `GitHubClient` loads PR metadata and reviewable files at the PR head SHA.
4. Deleted files and non-JS/TS-family files are excluded.
5. `reviewPullRequest` checks whether source files can be parsed.
6. Generic deterministic analysis runs for parseable files.
7. React analysis additionally runs for JSX/TSX files.
8. If configured, the AI provider receives the PR context plus deterministic findings.
9. `ReviewEngine` produces the final `ReviewResult`.
10. Changed-line information is extracted from patches and findings are filtered for inline review output.
11. GitHub receives a Check Run and PR review.

## Error handling

- Required PR-script environment variables fail fast with explicit errors.
- Invalid repository or PR-number formats fail before GitHub calls.
- A deterministic parser failure does not crash the whole review: the file is skipped and a `SOURCE_PARSE_FAILED` warning is added.
- AI output must be validated and normalized according to `AGENTS.md`; consumers must not rely on unchecked casts.

## Logging and monitoring

Current repository logging is minimal. `scripts/review-pr.ts` prints start/completion messages. There is no confirmed application-wide structured logging, telemetry backend, analytics service, or production monitoring integration.

## Authentication and authorization

The browser application has no confirmed user authentication flow. GitHub automation authenticates with `GITHUB_TOKEN`; workflow permissions are explicitly constrained to repository contents read, pull requests write, and checks write for the AI review workflow.

## Persistence and API flow

No database or persistent repository layer is currently present. GitHub is the principal external data source/sink for the operational review workflow. AI provider calls are external service calls behind `src/ai/`.

## Architectural limitations

- Browser UI and operational review pipeline are not connected.
- No persistent server-side application is implemented.
- Source-language coverage is JS/TS-family oriented.
- Static analysis is heuristic and rule-based; security coverage must not be represented as certification or proof of absence of vulnerabilities.
- Planned Phase 3.7 and 3.8 architecture should not be documented as current behavior until implemented.
