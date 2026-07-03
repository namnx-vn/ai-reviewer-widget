# Repository Guidelines

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
