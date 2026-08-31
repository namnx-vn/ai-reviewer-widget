# Phase 3 — Intelligence Engine

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: 🚧 Active

Phase 3 transforms the project from a static analyzer into an intelligent code review platform.

---

## Architecture

```text
GitHub PR
    ↓
Source / Diff
    ↓
Deterministic Analysis
├── AST Analysis
├── Architecture Intelligence
├── React Intelligence
├── Micro-Frontend Intelligence
├── Security Intelligence
└── Performance Intelligence
    ↓
AI Review
    ↓
Finding Normalization
    ↓
Merge / Deduplication
    ↓
Confidence / Severity
    ↓
Scoring / Decision
    ↓
GitHub Output
```

---

## Roadmap

| Phase | Status | Scope | Plan |
| --- | --- | --- | --- |
| 3.1 | ✅ Complete | AI Review Core | [3.1](./3.1-ai-review-core.md) |
| 3.2 | ✅ Complete | Architecture Intelligence | [3.2](./3.2-architecture-intelligence.md) |
| 3.3 | ✅ Complete | AI Review Engine | [3.3](./3.3-ai-review-engine.md) |
| 3.4 | ✅ Complete | React Intelligence | [3.4](./3.4-react-intelligence/README.md) |
| 3.5 | ✅ Complete | Micro-Frontend Intelligence | [3.5](./3.5-micro-frontend-intelligence.md) |
| 3.6 | ✅ Complete | Security Intelligence | [3.6](./3.6-security-intelligence/README.md) |
| 3.7 | 🚧 In Progress | Performance Intelligence | [3.7](./3.7-performance-intelligence/README.md) |
| 3.8 | ✅ Complete | Plugin SDK | [3.8](./3.8-plugin-sdk.md) |

Phase 3 remains active because Phase 3.7 still contains incomplete sub-phases. Phase 3.8 is complete independently and does not imply completion of Phase 3 as a whole.

---

## Current Implementation Audit

The repository currently contains production code for:

- AI provider abstraction and validated AI review flow
- AST and architecture rule execution
- React semantic analysis and React/Next.js/RSC plugins
- micro-frontend deterministic intelligence
- security analysis, policies, profiles, and quality gates
- performance analysis foundation, rules, cost propagation, profiles, and quality gates
- typed Plugin SDK registry and runtime

The Performance Intelligence roadmap remains intentionally marked in progress until every linked sub-plan satisfies its own rule, evidence, noise-control, and validation contract.

---

## Validation

Phase completion must be backed by the repository quality gates:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The repository is the source of truth: status must follow implemented and validated behavior, not roadmap intent.
