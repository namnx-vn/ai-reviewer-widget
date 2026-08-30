# ADR-001 — Deterministic Analysis Before AI

## Status

Accepted

## Context

AI Reviewer Widget combines static analysis with optional LLM review. LLM output is probabilistic and externally generated, while AST, architecture, React, MFE, and security analyzers can produce reproducible findings from source code.

## Decision

Run deterministic analysis before AI review and treat deterministic findings as the higher-trust input to the review engine.

The expected ordering is:

```text
AST / architecture / domain-specific deterministic analysis
        -> normalized findings
        -> optional AI review
        -> validation and normalization
        -> merge / deduplicate / score / decision
```

Deterministic analyzers must not call an LLM. AI-provider code must remain behind `src/ai/`, and AI output must be parsed and validated as untrusted external input before it becomes a review-domain finding.

Deterministic findings normally use confidence `1`. AI confidence must be explicitly validated and cannot be assumed from provider output.

## Consequences

### Positive

- deterministic rules remain reproducible and unit-testable;
- security and architecture findings do not depend on provider availability;
- AI can use deterministic context instead of replacing it;
- provider failures do not redefine analyzer architecture;
- normalized findings can be scored consistently by the review engine.

### Trade-offs

- some semantic problems require maintaining explicit analyzer/rule implementations;
- deterministic coverage can be incomplete and must not be described as proof of correctness/security;
- duplicate findings from deterministic and AI sources require engine-level normalization/deduplication.

## Evidence in current implementation

`src/application/review` computes deterministic findings through the ordered
analyzer adapter before supplying them to `ReviewEngine`. When an AI provider is
present, deterministic findings are also serialized into the budgeted AI input.
`src/review/reviewer.ts` remains a compatibility facade. `AGENTS.md` defines the
same deterministic-first trust model and requires validation of AI output.
