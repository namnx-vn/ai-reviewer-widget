# AI Reviewer Widget — Agent Engineering Contract

> This document is the canonical engineering contract for AI agents working
> on this repository.

AI coding agents MUST read this file before making any change.

This includes:

- Claude Code
- Codex
- GitHub Copilot
- Cursor
- Gemini
- OpenCode
- Other AI coding agents

Do not start implementation before understanding the rules in this document.

---

## Project Structure

This repo is a TypeScript/Vite React app for an AI-assisted code review widget. Key areas:

- `src/`: application code and core review logic.
  - `ai/`: provider and prompt abstractions.
  - `analyzer/`: AST and architecture rules.
  - `engine/`: review orchestration and scoring.
  - `github/`: GitHub PR and diff integration.
  - `components/`: UI widgets and dashboard views.
  - `review/`: aggregator, formatter, and reviewer logic.
  - `react/`: React-specific rules and utilities.
- `src/<module>/__tests__/`: Vitest suites colocated with the code they cover.
- `docs/`: architecture and review-pipeline docs.
- `public/`: static assets.
- `scripts/`: helper scripts such as `review-pr.ts`.

## Build, Test, and Local Development

Use the package scripts in `package.json`:

- `npm install` — install dependencies.
- `npm run dev` — start the Vite dev server.
- `npm run build` — compile TypeScript and bundle production assets.
- `npm run typecheck` — validate types without emitting output.
- `npm run lint` — run ESLint across the project.
- `npm test` — run the Vitest suite in CI mode.
- `npm run test:watch` — watch mode for local iteration.
- `npm run review:pr` — run the PR review script against GitHub diff data.

## Coding Style and Conventions

- Write TypeScript with explicit, typed interfaces where useful.
- Keep modules focused: one responsibility per file, small functions, and readable exports.
- Prefer descriptive names over abbreviations; use existing domain terms like `reviewer`, `analyzer`, `engine`, and `diff`.
- Follow the project’s ESLint + TypeScript setup. Do not add noisy debug logging or `console` calls in production code.
- Keep React components and review rules organized by feature area rather than mixing unrelated logic.

## Testing Guidelines

- Add or update tests alongside behavior changes.
- Place tests in a `__tests__/` directory inside the source module they cover.
- Prefer Vitest naming conventions such as `*.test.ts`.
- Run `npm test` before submitting changes, especially when touching parser, analyzer, or review engine logic.

## Commit and Pull Request Guidelines

- Use concise conventional commits such as `feat:`, `fix:`, `refactor:`, `docs:`, and `test:`.
- Keep PRs focused and include a short summary of the problem, the change, and the validation performed.
- Link related issues or PR references when applicable.
- For UI-facing changes, include screenshots or a brief visual description when useful.

## Architecture Notes

The system is layered: diff collection -> AST/architecture analysis -> review engine -> formatted findings. Keep those boundaries clear when adding new rules or providers.

Before modifying code:

1. Read `AGENTS.md`
2. Read `package.json`
3. Read the relevant plan
4. Inspect existing implementation
5. Implement
6. Test
7. Validate

## Architecture

[high-level architecture only]

## Tech Stack

[actual current stack only]

## Engineering Rules

- Strict TypeScript
- No `any`
- No unsafe casts
- No disabled lint/typecheck
- Tests required
- Deterministic analysis before AI
- AI output must be validated
- Respect module boundaries

## Implementation Roadmap

Detailed plans are maintained in `/plans`.

| Phase  | Status         | Plan                                                                                   |
| ------ | -------------- | -------------------------------------------------------------------------------------- |
| 1      | ✅ Complete    | [Phase 1](./plans/phase-1-foundation.md)                                               |
| 2      | ✅ Complete    | [Phase 2](./plans/phase-2-ast-analysis.md)                                             |
| 3.1    | ✅ Complete    | [3.1](./plans/phase-3/3.1-ai-review-core.md)                                           |
| 3.2    | ✅ Complete    | [3.2](./plans/phase-3/3.2-architecture-intelligence.md)                                |
| 3.3    | ✅ Complete    | [3.3](./plans/phase-3/3.3-ai-review-engine.md)                                         |
| 3.4.1  | ✅ Complete    | [React Rule Framework](./plans/phase-3/3.4-react-intelligence/3.4.1-rule-framework.md) |
| 3.4.2  | ✅ Complete    | [Semantic analysis](./plans/phase-3/3.4-react-intelligence/3.4.2-semantic-analysis.md) |
| 3.4.3  | ✅ Complete    | [hooks](./plans/phase-3/3.4-react-intelligence/3.4.3-hooks.md)                         |
| 3.4.4  | ✅ Complete    | [rendering](./plans/phase-3/3.4-react-intelligence/3.4.4-rendering.md)                 |
| 3.4.5  | ✅ Complete    | [State](./plans/phase-3/3.4-react-intelligence/3.4.5-state.md)                         |
| 3.4.6  | ✅ Complete    | [performance](./plans/phase-3/3.4-react-intelligence/3.4.6-performance.md)             |
| 3.4.7  | ✅ Complete    | [context](./plans/phase-3/3.4-react-intelligence/3.4.7-context.md)                     |
| 3.4.8  | ✅ Complete    | [patterns](./plans/phase-3/3.4-react-intelligence/3.4.8-patterns.md)                   |
| 3.4.9  | ✅ Complete    | [next.js](./plans/phase-3/3.4-react-intelligence/3.4.9-nextjs.md)                      |
| 3.4.10 | ✅ Complete    | [rsc](./plans/phase-3/3.4-react-intelligence/3.4.10-rsc.md)                            |
| 3.4.11 | ✅ Complete    | [integration](./plans/phase-3/3.4-react-intelligence/3.4.11-integration.md)            |
| 3.4.12 | ✅ Complete    | [hardening](./plans/phase-3/3.4-react-intelligence/3.4.12-hardening.md)                |
| 3.5    | ✅ Complete    | [Micro Frontend](./plans/phase-3/3.5-micro-frontend-intelligence.md)                   |
| 3.6    | ✅ Complete    | [Security](./plans/phase-3/3.6-security-intelligence/README.md)                        |
| 3.7    | ✅ Complete    | [Performance](./plans/phase-3/3.7-performance-intelligence/README.md)                  |
| 3.8    | ✅ Complete    | [Plugin SDK](./plans/phase-3/3.8-plugin-sdk.md)                                        |
| R1     | ✅ Complete    | [Source Architecture Refactor](./plans/source-architecture-refactor.md)                |

## Plan Execution Rule

When implementing a phase:

1. Read `AGENTS.md`
2. Open the corresponding plan
3. Follow the plan
4. Inspect current code
5. Do not invent architecture
6. Update the plan status when completed
7. Run validation

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build

```

# 1. Project Identity

Project:

AI Reviewer Widget

Repository:

https://github.com/namnx-vn/ai-reviewer-widget

Purpose:

An AI-assisted code review platform combining:

- AST analysis
- deterministic code rules
- architecture analysis
- React intelligence
- AI/LLM review
- GitHub Pull Request integration
- review scoring
- automated GitHub Checks

The long-term goal is to evolve this repository into a
production-grade AI Code Review Platform.

The project is NOT intended to remain a simple LLM wrapper.

---

# 2. Engineering Goals

The codebase must demonstrate:

- Senior Frontend engineering
- Staff-level architecture
- TypeScript expertise
- React expertise
- AST/code analysis
- AI engineering
- GitHub integration
- Plugin architecture
- Strong testing discipline
- Production-grade reliability

Prefer:

Correctness
over
Convenience

Architecture
over
Short-term implementation speed

Explicit types
over
implicit behavior

Deterministic analysis
over
unverified AI output

Small composable modules
over
large abstractions

---

# 3. Current Technology Stack

Do not change the technology stack without explicit authorization.

## Runtime

- Node.js 22+
- npm
- TypeScript
- ES Modules

## Frontend

- React 19
- React DOM 19
- Vite
- @vitejs/plugin-react-swc

## UI

- Ant Design
- styled-components
- Framer Motion
- lucide-react

## GitHub

- @octokit/rest
- GitHub Pull Request API
- GitHub Checks API

## Static Analysis

- TypeScript AST tooling
- @typescript-eslint/typescript-estree
- AST-based rule engine

## Testing

- Vitest

## Quality

- ESLint
- TypeScript strict checking

## CLI / Scripts

- tsx

---

# 4. Important Stack Rules

Do NOT introduce another framework or build system without explicit approval.

Do NOT migrate:

- React → Vue
- React → Next.js
- Vite → Webpack
- styled-components → another CSS solution
- Ant Design → another UI framework

unless the task explicitly requires it.

Do NOT introduce:

- Redux
- Zustand
- MobX
- React Query
- Next.js
- Tailwind

just because they are popular.

Dependencies must solve an actual architectural problem.

Before adding a dependency:

1. Check whether the existing stack already solves the problem.
2. Check whether a small internal abstraction is sufficient.
3. Check bundle/runtime implications.
4. Prefer existing dependencies.

---

# 5. Source of Truth Rule

The repository itself is the source of truth.

Before implementing:

1. Read this AGENTS.md.
2. Read package.json.
3. Inspect the relevant source files.
4. Follow existing architecture.
5. Reuse existing types and abstractions.
6. Only then implement the requested change.

Never assume that a previous conversation,
roadmap, generated answer, or AI response represents the current codebase.

The actual repository wins.

---

# 6. Current Project Structure

Expected high-level structure:

src/

├── ai/
├── analyzer/
│ ├── ast/
│ ├── architecture/
│ └── rules/
├── engine/
├── github/
├── review/
├── react/
├── components/
└── ...

src/

├── ai/
│   └── __tests__/
├── analyzer/
│   ├── ast/
│   │   └── __tests__/
│   └── security/
│       └── __tests__/
├── engine/
│   └── __tests__/
└── ...

scripts/

docs/

public/

Do not create random top-level directories.

New modules must belong to an existing architectural boundary
unless a new boundary is genuinely required.

## Target Maintainable Source Structure

The current repo already has useful boundaries (`ai`, `analyzer`, `engine`,
`github`, `review`, `react`, `mfe`, `plugins`, `cli`, `components`). Future
large refactors should evolve those boundaries toward an explicit
domain/application/adapters structure without breaking public exports.

Recommended target:

```text
src/
├── domain/
│   └── review/          # ReviewFinding, ReviewResult, scoring, decisions, aggregation
├── application/
│   └── review/          # reviewFiles/reviewPullRequest use cases and ports
├── analyzer/            # deterministic AST, architecture, security, performance analyzers
├── react/               # React-specific deterministic intelligence
├── mfe/                 # micro-frontend deterministic intelligence
├── ai/                  # LLM providers, prompts, parser, input policy adapter
├── github/              # GitHub PR/check/comment adapter
├── cli/                 # local CLI adapter and process-independent IO
├── plugins/             # extension contracts, registry, and runtime
└── ui/                  # browser app, feature presentation, and shared components
```

Migration rules:

- Move behavior incrementally; preserve compatibility re-exports from existing
  files such as `src/review/types.ts`, `src/review/reviewer.ts`, and
  `src/engine/review-engine.ts` until dependents are migrated.
- `domain/` must not import from `application/`, `ai/`, `github/`, `ui/`,
  `cli/`, `scripts/`, plugins, or concrete analyzers.
- `application/` may coordinate ports and use cases, but infrastructure must be
  injected rather than imported through unrelated modules.
- `analyzer/`, `react/`, and `mfe/` may depend on domain contracts and shared
  analyzer primitives, but must not depend on application use cases or
  infrastructure adapters.
- `ai/`, `github/`, `plugins/`, and `cli/` must integrate through application
  ports or the composition root rather than create alternate review pipelines.
- `ui/` must stay presentation/composition only and must not
  parse ASTs, call LLMs, call GitHub, or calculate review scores.
- Cross-boundary imports must use the owning boundary's public entry point.
  Deep imports are allowed only within the same subsystem.
- CLI, GitHub automation, plugins, tests, and future APIs must use one shared
  application review pipeline.
- Structural waves must preserve findings, warning codes, scores, decisions,
  quality-gate results, CLI exit codes, and GitHub output unless the active plan
  explicitly authorizes a behavior change.
- Avoid big-bang file moves. Each refactor step must keep
  `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` green.

---

# 7. Architecture

The system follows a layered architecture.

High-level flow:

GitHub PR
↓
PR / Diff Collector
↓
Source Context
↓
Deterministic Analysis
├── AST Analysis
├── Code Rules
└── Architecture Rules
↓
AI Review
├── Prompt Builder
├── Provider
└── Structured Output
↓
Finding Normalization
↓
Finding Merge
↓
Deduplication
↓
Confidence
↓
Severity
↓
Scoring
↓
Review Decision
↓
GitHub Output

Keep these boundaries explicit.

---

# 8. Architectural Responsibilities

## analyzer/

Responsible for deterministic code analysis.

Examples:

- AST parsing
- syntax inspection
- rule execution
- architecture validation

The analyzer MUST NOT call an LLM.

---

## ai/

Responsible for AI/LLM integration.

Examples:

- provider abstraction
- prompt construction
- AI response parsing
- retry handling
- AI-specific normalization

The AI layer MUST NOT directly manipulate GitHub.

---

## engine/

Responsible for review orchestration.

Examples:

- merge findings
- deduplicate findings
- confidence
- severity
- scoring
- decision

The engine coordinates systems.

It should not contain provider-specific implementation.

---

## review/

Responsible for review-domain models and aggregation.

Examples:

- ReviewFinding
- ReviewResult
- ReviewStats
- score calculation
- review aggregation

Keep domain models independent from UI and GitHub.

---

## domain/

Target location for framework-independent review contracts and pure policies.

Examples:

- ReviewFinding, ReviewResult, and ReviewWarning
- scoring and decision policies
- finding aggregation, merge, deduplication, confidence, and severity policies

The domain must be deterministic, side-effect free, and independent of
application and infrastructure code.

---

## application/

Target location for review use cases, ports, and orchestration.

Examples:

- review files
- review a pull request
- run registered deterministic analyzers
- invoke optional AI review through a port
- apply quality gates
- construct the final ReviewResult

Application code owns sequencing but must not contain Octokit, filesystem,
terminal, DOM, or concrete AI HTTP implementation details.

---

## github/

Responsible for GitHub integration.

Examples:

- PR retrieval
- diff retrieval
- Check Runs
- PR reviews
- GitHub comments

GitHub-specific code must stay inside this boundary.

---

## react/

Responsible for React-specific intelligence.

Examples:

- hooks analysis
- rendering analysis
- performance analysis
- state analysis
- React patterns
- React-specific architecture rules

React rules must NOT be mixed into generic AST rules.

---

## components/ and ui/

`components/` is the legacy presentation location. New feature-oriented browser
code belongs under `ui/`; existing components migrate incrementally.

UI components must not contain:

- GitHub API calls
- AST parsing
- LLM calls
- review scoring logic

Keep business logic outside React components.

---

# 9. Dependency Direction

Preferred dependency direction:

ui / cli / GitHub entry points
↓
application
↓
domain

Infrastructure:

github
ai
analyzer
plugins

must implement or be supplied through application ports rather than being
deeply imported through unrelated modules.

Avoid circular dependencies.

The domain layer should remain as independent as possible.

---

# 10. Rule Architecture

Rules are first-class architecture components.

A rule should be:

- deterministic where possible
- isolated
- testable
- composable
- identifiable
- configurable

Every rule should have:

- unique ruleId
- description
- detection logic
- severity
- source
- location
- message
- optional suggestion
- tests

Example:

security.no-eval

react.hooks.missing-deps

react.rendering.unstable-props

architecture.mfe.remote-boundary

---

# 11. Deterministic vs AI Findings

Deterministic analysis has higher trust than AI analysis.

Preferred trust order:

1. AST
2. Architecture
3. AI

Deterministic findings:

confidence = 1

AI findings:

confidence must be explicitly validated.

Never blindly trust LLM output.

---

# 12. AI Output Contract

LLM output MUST be treated as untrusted external input.

Never assume that an LLM returns valid JSON.

Always:

1. Parse safely.
2. Validate structure.
3. Validate severity.
4. Validate confidence.
5. Normalize fields.
6. Reject invalid findings.

Never use:

```ts
JSON.parse(value) as ReviewResult;
```
