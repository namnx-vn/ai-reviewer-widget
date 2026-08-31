# Phase 3.4 — React Intelligence Engine

> Engineering contract: [`../../../AGENTS.md`](../../../AGENTS.md)

Status: ✅ Complete

---

## Objective

Build a semantic React analysis engine that understands React-specific behavior beyond generic AST analysis.

The engine covers:

- React Hooks
- components and JSX
- rendering and state
- React Context
- React patterns and performance
- Next.js App Router intelligence through an optional plugin
- React Server Components boundaries
- full review-pipeline integration and hardening

The implementation follows the existing architecture:

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
```

---

## Roadmap

| Sub-phase | Status | Scope | Plan |
| --- | --- | --- | --- |
| **3.4.1** | ✅ Complete | React Rule Framework | [3.4.1](./3.4.1-rule-framework.md) |
| **3.4.2** | ✅ Complete | React Semantic Analysis | [3.4.2](./3.4.2-semantic-analysis.md) |
| **3.4.3** | ✅ Complete | React Hooks Intelligence | [3.4.3](./3.4.3-hooks.md) |
| **3.4.4** | ✅ Complete | React Rendering Intelligence | [3.4.4](./3.4.4-rendering.md) |
| **3.4.5** | ✅ Complete | React State Intelligence | [3.4.5](./3.4.5-state.md) |
| **3.4.6** | ✅ Complete | React Performance Intelligence | [3.4.6](./3.4.6-performance.md) |
| **3.4.7** | ✅ Complete | React Context Intelligence | [3.4.7](./3.4.7-context.md) |
| **3.4.8** | ✅ Complete | React Patterns Intelligence | [3.4.8](./3.4.8-patterns.md) |
| **3.4.9** | ✅ Complete | Next.js Intelligence | [3.4.9](./3.4.9-nextjs.md) |
| **3.4.10** | ✅ Complete | React Server Components Intelligence | [3.4.10](./3.4.10-rsc.md) |
| **3.4.11** | ✅ Complete | React Integration | [3.4.11](./3.4.11-integration.md) |
| **3.4.12** | ✅ Complete | Testing & Hardening | [3.4.12](./3.4.12-hardening.md) |

---

## Delivered Architecture

### Semantic and rule infrastructure

- typed React rule contract and registry
- React analysis context
- component, hook, JSX, scope, declaration, and reference analysis
- plugin-based React rule registration
- deterministic finding production

### Rule intelligence

- Hook lifecycle and dependency analysis
- rendering, memoization, keys, callbacks, and unstable-prop analysis
- state ownership, mutation, derivation, and synchronization analysis
- React performance and Context analysis
- ecosystem/common-pattern analysis
- optional Next.js App Router analysis
- RSC client/server boundary analysis

### Integration and hardening

- React findings flow through the existing review pipeline
- Next.js plugin activation is path/evidence constrained
- malformed source and plugin failures are isolated
- duplicate rules/findings are handled deterministically
- parser and false-positive regressions are covered by tests

---

## Completion Criteria

Phase 3.4 is complete because:

- [x] React semantic analysis is implemented
- [x] React rules are registered through the plugin architecture
- [x] rules produce deterministic `ReviewFinding[]`
- [x] positive, negative, and regression fixtures exist
- [x] React findings integrate with the review engine
- [x] Next.js and RSC boundaries are implemented
- [x] false-positive and malformed-input behavior is hardened
- [x] integration and hardening sub-phases are complete

Required repository validation remains:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

## Status Legend

| Status | Meaning |
| --- | --- |
| ✅ Complete | Implemented, tested, and validated |
| 🚧 Active | Current phase of development |
| 📌 Next | Next implementation target |
| ⏳ Planned | Planned for later |
| ⚠️ Blocked | Blocked by dependency or architecture |
