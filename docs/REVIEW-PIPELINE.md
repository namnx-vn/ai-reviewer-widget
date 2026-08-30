# Review Pipeline

## Current pipeline

```text
Review files / GitHub PR
        |
        v
Application source contracts
        |
        v
Shared deterministic adapter
   | parse failure
   +--> ReviewWarning(SOURCE_PARSE_FAILED)
        |
        v
Deterministic analysis
   |-- AST and security
   |-- performance and architecture
   |-- MFE and supply-chain
   `-- React/Next.js contribution for JSX/TSX
        |
        v
Deterministic findings
        |
        +----------------------+
        | optional AI provider |
        v                      v
              ReviewEngine
                  |
                  v
             ReviewResult
        score / decision / stats
        findings / warnings / duration
                  |
          +-------+-------+
          |               |
          v               v
     GitHub Check     Inline PR review
                      (changed lines only)
```

## Deterministic review

`src/application/review` owns `reviewFiles(files)` and executes deterministic
analysis through an injected port without requiring an AI provider. The shared
adapter parses supported JS/TS-family sources, reports parse failures as
warnings, and retains manifests for supply-chain analysis.

`src/analyzer/composition` runs immutable, ordered contributions. The default
order is AST, security, performance, architecture, MFE, supply-chain, and React.
Plugin analyzers and plugin React rules follow built-ins in registration order.

## React plugin selection

The default React plugin is used for JSX/TSX. Files whose normalized paths match Next.js App Router entry filenames (`page`, `layout`, `template`, `loading`, `error`, `not-found`, or `route`) under an `app/` directory receive both the React and Next.js plugins.

## Pull-request review with AI

`reviewPullRequest(input, aiProvider?)` first computes deterministic findings.
When an AI provider exists, the AI input policy builds input from:

- pull-request title;
- optional description;
- changed-line patches with sensitive-value redaction and size budgets;
- serialized deterministic findings.

The `ReviewEngine` then executes with deterministic findings, warnings, and optional AI input/provider. AI findings are normalized into the common review finding model rather than bypassing the engine.

The application use case applies optional security quality-gate policy after
engine execution. Explicit baselines, suppressions, and unchanged security
findings can be accepted without removing them from the auditable result.

## Finding trust

The engineering contract establishes deterministic-first trust: AST/architecture findings are preferred over unverified AI output. Deterministic findings are expected to use confidence `1`; AI confidence must be explicitly validated and normalized.

## GitHub output

`src/github/review-pull-request.ts` publishes the complete review result as a
Check Run. Inline review comments use a changed-line filter so findings are only
posted inline when their location is part of the PR patch. The executable script
only parses environment, constructs adapters, and logs lifecycle messages.

## Failure behavior

- Missing/invalid PR execution environment fails fast.
- Individual parser failures degrade to warnings.
- Individual analyzer/plugin contribution failures degrade to
  `ANALYZER_CONTRIBUTION_FAILED` warnings while successful findings remain.
- Invalid AI output must be rejected/normalized by the AI boundary rather than cast into trusted domain objects.

## Current limitations

- Browser UI is not a consumer of the live pipeline.
- Language support is currently JS/TS-family focused.
