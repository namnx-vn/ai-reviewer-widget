# AI Reviewer Architecture

## Overview

AI Reviewer Widget uses a layered review architecture in which deterministic analysis is executed before optional AI review and before GitHub output. Domain findings are normalized so infrastructure concerns do not leak into analyzer or UI code.

```text
GitHub PR / local files / plugin composition
        |
        v
Application review use cases + injected ports
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

Owns deterministic source analysis. `src/analyzer/composition/` defines ordered
analyzer contributions, an immutable registry, source preparation, and the
shared adapter used by application and plugin entry points. AST, architecture,
security, performance, MFE, supply-chain, and React stages remain in their
owning subsystems. The analyzer boundary must not call an LLM or GitHub.

### `src/analyzer/security/`

A first-class security subsystem containing an engine, registry, typed security model, rule families, taint-flow analysis, interprocedural analysis, supply-chain analysis, compliance mapping, security profiles/policies, and quality-gate evaluation.

### `src/react/`

Owns React-specific semantic analysis and rule execution. The application
composition root registers React as an explicit analyzer contribution for
`.tsx`/`.jsx` files. Next.js plugins are enabled when the file path matches an
App Router entry pattern such as `app/**/page.tsx` or `layout.tsx`.

### `src/mfe/`

Owns micro-frontend intelligence and keeps MFE-specific architecture semantics separate from generic AST rules.

### `src/ai/`

Owns AI provider construction, prompt/input handling, parsing, validation, and AI-specific normalization. AI output is treated as external/untrusted data by the engineering contract.

### `src/engine/`

Owns review orchestration after findings exist. `ReviewEngine` coordinates deterministic findings, warnings, optional AI review, and the final review result. Provider-specific implementation should not be placed here.

### `src/domain/review/`

Owns framework-independent review contracts, scoring, decisions, and
aggregation. It has no imports from application, analyzers, AI, GitHub, plugins,
CLI, or UI. Legacy review and decision modules are compatibility re-exports.

### `src/application/review/`

Owns `reviewFiles` and `reviewPullRequest` use cases plus ports for source files,
deterministic analysis, AI review, quality gates, clocks, pipelines, and
publishers. The use cases depend only on ports and the review domain; concrete
adapters are assembled in `composition-root.ts`.

### `src/review/`

Provides compatibility exports for the former public review paths. New
production imports use `src/domain/review` and `src/application/review`.

### `src/github/`

Owns GitHub infrastructure: pull-request retrieval, file content,
diff/changed-line handling, Check Runs, and PR reviews.
`review-pull-request.ts` converts GitHub data to application contracts and
publishes results. GitHub calls remain outside analyzers and UI components.

### `src/ui/`

Owns browser fixtures and presentation. `src/App.tsx` and `src/components/*`
are compatibility exports. The demo does not fetch GitHub data or invoke the
review pipeline.

## Dependency direction

Preferred direction follows the engineering contract:

```text
ui / cli / GitHub / plugin entry points
    |
application / review orchestration
    |
engine + domain
    |
analysis/domain contracts

Infrastructure adapters: github, ai
Deterministic analyzers: analyzer, react, mfe
```

Infrastructure should be passed into orchestration rather than imported through unrelated modules. Avoid circular dependencies and avoid placing GitHub, LLM, scoring, or AST parsing logic in React components.

## Application lifecycle

### Browser lifecycle

1. Vite starts the React application through `src/main.tsx`.
2. `src/App.tsx` delegates to `src/ui/App.tsx`.
3. The UI composes a static fixture with review-dashboard components.

No authentication, routing, server persistence, or live API state is currently confirmed in the browser path.

### Pull-request review lifecycle

1. GitHub Actions runs quality gates and executes `npm run review:pr`.
2. `scripts/review-pr.ts` validates `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `PR_NUMBER`.
3. `reviewGitHubPullRequest` loads PR metadata and converts reviewable head/base
   files to application `SourceFile` contracts.
4. Application review use cases run the ordered deterministic adapter; malformed
   sources become warnings while manifests still reach supply-chain analysis.
5. React analysis runs as an explicit contribution for JSX/TSX files.
6. If configured, the AI provider receives redacted, budgeted patch context and
   serialized deterministic findings.
7. `ReviewEngine` and domain policies produce the final `ReviewResult` and the
   application applies the optional security quality gate.
8. The GitHub adapter filters inline findings to changed lines and publishes a
   Check Run and PR review.

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
- Runtime behavior and false-positive rates still require profiling against
  representative repositories even though the performance and plugin phases
  are implemented.
