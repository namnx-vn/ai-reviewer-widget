# Phase 3.6 — Security Intelligence

> Engineering contract: [`../../../AGENTS.md`](../../../AGENTS.md)

Status: 🚧 In Progress

---

## Objective

Build deterministic, auditable, explainable security intelligence for JavaScript, TypeScript, React, and supported server-side JavaScript patterns.

The subsystem is intended for high-assurance financial and banking review workflows, but MUST NOT claim that passing static analysis proves security, certification, or compliance.

Core invariant:

```text
same source + same configuration + same analyzer version
= same findings + same IDs + same severity + same evidence + same ordering
```

Probabilistic AI MUST NOT participate in vulnerability detection. AI may only be used later for explanation, remediation, summarization, or triage assistance.

---

## Standards Alignment

Rules may map to CWE, OWASP Top 10, OWASP ASVS, PCI DSS, NIST SSDF, and internal banking policy. Mappings mean coverage/traceability only, never automatic compliance or certification.

---

## Mandatory Engineering Constraints

1. No LLM calls from security analysis.
2. No `any`, unsafe casts, lint suppression, or typecheck suppression.
3. No hidden mutable global state or nondeterministic finding generation.
4. Rule IDs and finding fingerprints must be stable.
5. Source/sink/sanitizer behavior must be centrally modeled.
6. Sanitizers must be sink-aware.
7. Severity and confidence remain separate concepts.
8. Framework-specific behavior must not leak into generic primitives.
9. Security rules do not access GitHub APIs, manipulate UI, or calculate review score.
10. Every rule is isolated, configurable, deterministic, and independently tested.
11. New dependencies require explicit architectural justification.
12. Repository source of truth wins over this plan if the architecture evolves; deviations must be intentional and documented.

---

## Target Architecture

```text
src/analyzer/security/
├── engine/
├── model/
├── registry/
├── flow/
├── interprocedural/
├── policies/
├── compliance/
├── quality-gate/
├── rules/
│   ├── execution/
│   ├── injection/
│   ├── xss/
│   ├── secrets/
│   ├── crypto/
│   ├── auth/
│   ├── authorization/
│   ├── session/
│   ├── data/
│   ├── network/
│   ├── filesystem/
│   ├── ssrf/
│   ├── configuration/
│   ├── logging/
│   ├── supply-chain/
│   ├── object/
│   └── business/
└── index.ts
```

React-specific security rules remain in the React boundary and consume shared security primitives; generic security code must not import React-specific modules.

---

## Implementation Order

The order below is normative unless repository architecture requires a documented deviation.

| Phase | Status | Plan |
| --- | --- | --- |
| 3.6.0 | ✅ Complete | [Security Architecture Foundation](./3.6.0-security-foundation.md) |
| 3.6.1 | 🚧 Implemented — validation pending | [Dangerous Execution](./3.6.1-dangerous-execution.md) |
| 3.6.2 | ✅ Complete | [Injection Intelligence](./3.6.2-injection.md) |
| 3.6.3 | ✅ Complete | [XSS & Browser Security](./3.6.3-xss-browser.md) |
| 3.6.4 | ✅ Complete | [Secrets & Credential Exposure](./3.6.4-secrets.md) |
| 3.6.5 | ✅ Complete | [Cryptography Intelligence](./3.6.5-cryptography.md) |
| 3.6.6 | ✅ Complete | [Authentication Intelligence](./3.6.6-authentication.md) |
| 3.6.7 | 🚧 Implemented — validation pending | [Authorization Intelligence](./3.6.7-authorization.md) |
| 3.6.8 | ✅ Complete | [Session & Token Security](./3.6.8-session-token.md) |
| 3.6.9 | ✅ Complete | [Sensitive Data Protection](./3.6.9-sensitive-data.md) |
| 3.6.10 | ✅ Complete | [Network & Transport Security](./3.6.10-network-transport.md) |
| 3.6.11 | ✅ Complete | [Filesystem & Resource Security](./3.6.11-filesystem.md) |
| 3.6.12 | ✅ Complete | [SSRF Intelligence](./3.6.12-ssrf.md) |
| 3.6.13 | ✅ Complete | [Security Configuration](./3.6.13-security-configuration.md) |
| 3.6.14 | 🚧 Implemented — validation pending | [Logging & Error Security](./3.6.14-logging-errors.md) |
| 3.6.15 | ✅ Complete | [Supply Chain Security](./3.6.15-supply-chain.md) |
| 3.6.16 | ✅ Complete | [JavaScript Object Security](./3.6.16-object-security.md) |
| 3.6.17 | 🚧 Implemented — validation pending | [Business Logic Security](./3.6.17-business-logic.md) |
| 3.6.18 | 🚧 Implemented — validation pending | [React / Browser Banking Security](./3.6.18-react-banking.md) |
| 3.6.19 | ✅ Complete | [Security Taint Engine](./3.6.19-taint-engine.md) |
| 3.6.20 | ✅ Complete | [Interprocedural Security Analysis](./3.6.20-interprocedural.md) |
| 3.6.21 | ✅ Complete | [Compliance Mapping](./3.6.21-compliance.md) |
| 3.6.22 | ✅ Complete | [Banking Security Profile](./3.6.22-banking-profile.md) |
| 3.6.23 | ✅ Complete | [Security Quality Gates](./3.6.23-quality-gates.md) |

---

## Dependency Contract

- 3.6.0 is mandatory foundation for every phase.
- 3.6.19 is the shared taint/data-flow engine and MUST be used by mature injection, filesystem, SSRF, sensitive-data, and object-security rules.
- 3.6.20 extends 3.6.19 across function/file boundaries; no rule may invent a private interprocedural engine.
- Authentication, authorization, business-logic, and React banking rules should reuse common semantic/data-flow primitives.
- Compliance and banking profiles interpret findings; they do not redefine detection semantics.
- Quality gates consume findings/policies and must remain independent of GitHub presentation.

---

## Shared Rule Contract

Every security rule must define: stable ID, title, category, default severity, default confidence, trigger conditions, non-trigger conditions, evidence, standards mapping where applicable, positive tests, negative tests, boundary tests, false-positive regressions, and sanitization cases where relevant.

Severity means impact if the finding is real. Confidence means certainty that the detected condition is real. They MUST NOT be conflated.

---

## Shared Validation

Before any sub-phase is marked complete:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

A phase is complete only when implementation, tests, false-positive review, deterministic ordering review, validation, and plan status update are all complete.

---

## Anti-Drift Rules

Future agents MUST NOT replace the security architecture with ESLint/Semgrep, add another parser without approval, use an LLM to decide vulnerability existence, create separate taint engines per rule, mix generic security rules into React or vice versa, hardcode banking severity into detection, use random IDs, silently rename rule IDs, claim compliance, skip negative tests, or duplicate existing semantic infrastructure.

Correctness and evidence take priority over raw rule count.
