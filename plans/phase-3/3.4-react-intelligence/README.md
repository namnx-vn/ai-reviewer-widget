# Phase 3.4 — React Intelligence Engine

> Engineering contract: [`../../../AGENTS.md`](../../../../AGENTS.md)

Status: 🚧 Active

---

## Objective

Build a semantic React analysis engine.

Generic AST analysis is insufficient for React.

The engine must understand:

- hooks
- components
- JSX
- rendering
- state
- context
- React patterns
- React performance

---

## Architecture

```text
React Source
     ↓
AST
     ↓
React Semantic Context
     ↓
React Registry
     ↓
React Plugins
     ↓
React Rules
     ↓
ReviewFinding[]