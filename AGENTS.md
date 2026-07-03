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
- `tests/`: Vitest suites organized by domain (`ai`, `engine`, `github`, `review`, etc.).
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
- Place tests under `tests/` using the existing category structure.
- Prefer Vitest naming conventions such as `*.test.ts`.
- Run `npm test` before submitting changes, especially when touching parser, analyzer, or review engine logic.

## Commit and Pull Request Guidelines

- Use concise conventional commits such as `feat:`, `fix:`, `refactor:`, `docs:`, and `test:`.
- Keep PRs focused and include a short summary of the problem, the change, and the validation performed.
- Link related issues or PR references when applicable.
- For UI-facing changes, include screenshots or a brief visual description when useful.

## Architecture Notes

The system is layered: diff collection -> AST/architecture analysis -> review engine -> formatted findings. Keep those boundaries clear when adding new rules or providers.

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

- React 18
- React DOM 18
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

tests/

├── ai/
├── analyzer/
├── engine/
├── github/
├── review/
├── react/
└── ...

scripts/

docs/

public/

Do not create random top-level directories.

New modules must belong to an existing architectural boundary
unless a new boundary is genuinely required.

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

## components/

Responsible for presentation/UI.

UI components must not contain:

- GitHub API calls
- AST parsing
- LLM calls
- review scoring logic

Keep business logic outside React components.

---

# 9. Dependency Direction

Preferred dependency direction:

components
↓
application / orchestration
↓
engine
↓
domain

Infrastructure:

github
ai
analyzer

must be injected into orchestration rather than deeply imported
through unrelated modules.

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
