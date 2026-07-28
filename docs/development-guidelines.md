# Development Guidelines

These rules describe conventions evidenced by the repository and `AGENTS.md`. Suggested improvements are separated at the end.

## Before changing code

1. Read `AGENTS.md`.
2. Read `package.json`.
3. Read the relevant phase plan under `plans/`.
4. Inspect the existing implementation and tests in that boundary.
5. Reuse existing types and abstractions.
6. Run validation before submitting changes.

The repository is the source of truth when plan text and implementation differ.

## Module organization

Keep new code inside an existing architectural boundary whenever possible:

- `src/analyzer/` for deterministic generic, architecture, and security analysis;
- `src/react/` for React-specific semantics/rules;
- `src/mfe/` for micro-frontend intelligence;
- `src/ai/` for provider/prompt/AI-output concerns;
- `src/engine/` for orchestration, scoring, confidence, severity, and decisions;
- `src/review/` for review-domain models and aggregation;
- `src/github/` for GitHub API behavior;
- `src/components/` for presentation only.

Do not create unrelated top-level directories.

## TypeScript and imports

The project uses strict TypeScript and ES modules. `AGENTS.md` explicitly forbids `any`, unsafe casts, and disabled lint/typecheck rules. Prefer explicit interfaces/types where they improve domain clarity and use `import type` for type-only imports, as current review modules do.

## Rule design

Rules are first-class components. A rule should be deterministic when possible, isolated, testable, composable, identifiable, and configurable. Use stable rule IDs such as:

```text
security.no-eval
react.hooks.missing-deps
architecture.mfe.remote-boundary
```

New rules should return normalized findings with the repository's established fields: identifier/rule ID, title/message, severity, source, location where available, optional suggestion, and confidence.

## Deterministic analysis before AI

Do not move deterministic checks into prompts merely for convenience. The expected trust ordering is AST/architecture before AI, and deterministic findings normally use full confidence. The analyzer layer must not call an LLM.

## AI provider changes

Treat model output as untrusted external input. Parse safely, validate structure and enumerated fields, normalize values, and reject invalid findings. Do not use unchecked constructs such as:

```ts
JSON.parse(value) as ReviewResult
```

Provider-specific behavior belongs in `src/ai/`, not in `src/engine/` or `src/github/`.

## React rules

React-specific rules belong in `src/react/`, not generic AST rules. The current reviewer executes React analysis for JSX/TSX files and adds the Next.js plugin for App Router entry paths. Follow existing plugin/engine patterns rather than bypassing them.

## Security rules

Use the security model, registry, and engine under `src/analyzer/security/`. Prefer extending existing rule families or policy/flow abstractions instead of adding one-off scans outside the subsystem. When flow semantics are needed, use the existing taint/interprocedural contracts.

## GitHub integration

GitHub-specific code stays in `src/github/` or executable scripts that orchestrate that boundary. Analyzer, engine, and UI modules must not directly manipulate GitHub resources.

## Components and styling

The UI stack is React 18, Ant Design, styled-components, Framer Motion, and lucide-react. Do not introduce another UI framework, state library, CSS system, or build framework without explicit approval. In particular, `AGENTS.md` says not to introduce Redux, Zustand, MobX, React Query, Next.js, or Tailwind merely by preference.

Presentation components must not perform AST parsing, GitHub API calls, LLM calls, or review scoring.

## State management

No external application state library is currently part of the stack. Do not document Redux/Zustand/etc. as current architecture and do not add one without an actual architectural requirement.

## Error handling

Prefer explicit validation at boundaries. Current examples include environment validation in `scripts/review-pr.ts` and parse-failure conversion into `ReviewWarning`. Preserve the distinction between recoverable warnings and fatal configuration errors.

## Logging

Avoid noisy `console` calls in production code. The executable PR script currently uses concise lifecycle logging; do not treat console logging as an application-wide observability strategy.

## Testing expectations

Add or update tests with behavior changes. Use the existing domain-oriented test layout and Vitest `*.test.ts` convention. Run at least:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use `npm run test:e2e` for browser-flow changes and `npm run test:coverage` when evaluating coverage.

## Commit and pull-request conventions

Repository guidance uses concise conventional prefixes such as `feat:`, `fix:`, `refactor:`, `docs:`, and `test:`. Keep PRs focused and state the problem, change, and validation. Include screenshots or a brief visual description for UI-facing changes when useful.

## Adding a new deterministic rule

Follow the nearest existing rule family rather than inventing a parallel framework:

1. choose the correct domain boundary;
2. define/reuse the rule contract and stable rule ID;
3. implement deterministic detection;
4. emit normalized findings using existing types;
5. register/export the rule using the local registry/plugin pattern;
6. add focused positive/negative tests;
7. run validation.

## Recommendations

These are recommendations, not current repository rules:

- add a small documentation-link checker to CI;
- document exact coverage thresholds if/when they become enforced;
- add a dedicated contributor guide only if contribution workflow grows beyond `AGENTS.md` + this document;
- connect the browser dashboard to a real review result only when an explicit application/API boundary is designed.
