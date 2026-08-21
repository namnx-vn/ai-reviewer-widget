# Phase 5 — Advanced AI Platform

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: ✅ Complete for the currently defined scope

---

## Objective

Introduce advanced AI capabilities without weakening
the deterministic review architecture.

Deterministic analysis remains the first and higher-trust review layer.
Multi-agent AI review is an optional enrichment step and continues through
existing AI parsing, confidence, severity, deduplication and review scoring.

---

## 5.1 Multi-Agent Review

Status: ✅ Complete

```text
Deterministic Analysis
         │
         ↓
Review Orchestrator
       │
 ┌─────┼─────┐
 ↓     ↓     ↓
Security React Architecture
 Agent   Agent   Agent
 │       │       │
 └───────┼───────┘
         ↓
 Finding Merger
         │
         ↓
 Existing Review Engine
```

### Scope

- Add a composite `AIProvider` rather than bypassing the existing review engine.
- Run Security, React and Architecture specialist reviews concurrently.
- Give each specialist an explicit role and bounded concern list.
- Preserve specialist provenance on normalized AI findings.
- Merge duplicate specialist findings deterministically, preferring higher confidence.
- Retain successful specialist results when another specialist fails.
- Fail the AI layer only when every specialist fails.
- Surface partial agent failures as non-fatal review warnings.
- Keep single-agent review as the default to avoid unexpected AI request cost changes.
- Enable multi-agent mode explicitly with `AI_REVIEW_MODE=multi-agent`.

### Rule IDs

```text
ai.security-review
ai.react-review
ai.architecture-review
```

### Configuration

```text
AI_REVIEW_MODE=single       # default
AI_REVIEW_MODE=multi-agent  # Phase 5.1
```

The existing provider configuration remains unchanged:

```text
AI_API_KEY
AI_MODEL
AI_BASE_URL
AI_ALLOWED_BASE_URLS
AI_TIMEOUT_MS
```

### Acceptance Criteria

- [x] Deterministic findings are produced before AI review.
- [x] Three specialist agents receive the same sanitized PR input with bounded focus instructions.
- [x] Specialist calls run concurrently.
- [x] Duplicate specialist findings are merged deterministically.
- [x] Specialist provenance reaches final `ReviewFinding.ruleId`.
- [x] One failed specialist does not discard successful specialist findings.
- [x] All failed specialists fall back through the existing `AI_REVIEW_FAILED` path.
- [x] Multi-agent mode is opt-in and does not change the default provider behavior.
- [x] Tests cover orchestration, failure isolation, prompt scoping, configuration and engine warning propagation.

---

## Future Phase 5 Areas

No additional Phase 5 sub-phases are currently specified in this repository.
Add future advanced-AI work as explicit plan files before implementation rather
than inventing architecture outside the roadmap.
