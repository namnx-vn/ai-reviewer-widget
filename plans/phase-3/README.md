# Phase 3 — Intelligence Engine

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Phase 3 transforms the project from a static analyzer
into an intelligent code review platform.

---

## Architecture

```text
GitHub PR
    ↓
Source / Diff
    ↓
AST Analyzer
    ↓
Architecture Analyzer
    ↓
React Intelligence
    ↓
AI Review
    ↓
Finding Normalization
    ↓
Merge
    ↓
Deduplication
    ↓
Confidence
    ↓
Severity
    ↓
Scoring
    ↓
Decision
    ↓
GitHub