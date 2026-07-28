# Review Pipeline

## Current pipeline

```text
Review files / GitHub PR
        |
        v
Filter supported source files
        |
        v
Parseability check
   | parse failure
   +--> ReviewWarning(SOURCE_PARSE_FAILED)
        |
        v
Deterministic analysis
   |-- generic analyzer
   |-- architecture/security analysis
   `-- React engine for JSX/TSX
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

`reviewFiles(files)` executes deterministic analysis and aggregates the result without requiring an AI provider. Before analysis, files are restricted to supported JS/TS-family source extensions and parsed. A parse failure becomes a warning and that file is skipped.

`analyzeDeterministicFiles` combines generic `analyzeFiles(...)` findings with React findings. React analysis runs only for `.tsx` and `.jsx` files.

## React plugin selection

The default React plugin is used for JSX/TSX. Files whose normalized paths match Next.js App Router entry filenames (`page`, `layout`, `template`, `loading`, `error`, `not-found`, or `route`) under an `app/` directory receive both the React and Next.js plugins.

## Pull-request review with AI

`reviewPullRequest(input, aiProvider?)` first computes deterministic findings. When an AI provider exists, it builds AI input from:

- pull-request title;
- optional description;
- concatenated file path/content context;
- serialized deterministic findings.

The `ReviewEngine` then executes with deterministic findings, warnings, and optional AI input/provider. AI findings are normalized into the common review finding model rather than bypassing the engine.

## Finding trust

The engineering contract establishes deterministic-first trust: AST/architecture findings are preferred over unverified AI output. Deterministic findings are expected to use confidence `1`; AI confidence must be explicitly validated and normalized.

## GitHub output

The PR script publishes the complete review result as a Check Run. Inline review comments use a changed-line filter so findings are only posted inline when their location is part of the PR patch.

## Failure behavior

- Missing/invalid PR execution environment fails fast.
- Individual parser failures degrade to warnings.
- Invalid AI output must be rejected/normalized by the AI boundary rather than cast into trusted domain objects.

## Current limitations

- The GitHub workflow sends full fetched file content into review context rather than only the textual patch.
- Browser UI is not a consumer of the live pipeline.
- Language support is currently JS/TS-family focused.
