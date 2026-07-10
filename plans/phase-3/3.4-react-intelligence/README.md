# Phase 3.4 — React Intelligence Engine

> Engineering contract: [`../../../AGENTS.md`](../../../AGENTS.md)

Status: 🚧 Active

---

## Objective

Build a semantic React analysis engine that understands React-specific behavior beyond generic AST analysis.

The engine covers:

* React Hooks
* Components
* JSX
* Rendering
* State
* Context
* React patterns
* React performance
* Framework/library-specific React intelligence

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

# Roadmap

| Sub-phase  | Status      | Scope                          | Plan                                  |
| ---------- | ----------- | ------------------------------ | ------------------------------------- |
| **3.4.1**  | ✅ Complete | React Rule Framework           | [3.4.1](./3.4.1-rule-framework.md)    |
| **3.4.2**  | ✅ Complete | React Semantic Analysis        | [3.4.2](./3.4.2-semantic-analysis.md) |
| **3.4.3**  | ✅ Complete | React Hooks Intelligence       | [3.4.3](./3.4.3-hooks.md)             |
| **3.4.4**  | ✅ Complete | React Rendering Intelligence   | [3.4.4](./3.4.4-rendering.md)         |
| **3.4.5**  | ✅ Complete | React State Intelligence       | [3.4.5](./3.4.5-state.md)             |
| **3.4.6**  | ✅ Complete | React Performance Intelligence | [3.4.6](./3.4.6-performance.md)       |
| **3.4.7**  | ✅ Complete | React Context Intelligence     | [3.4.7](./3.4.7-context.md)           |
| **3.4.8**  | ⏳ Planned  | React Patterns Intelligence    | [3.4.8](./3.4.8-patterns.md)          |
| **3.4.9**  | ⏳ Planned  | React Suspense Intelligence    | [3.4.9](./3.4.9-suspense.md)          |
| **3.4.10** | ⏳ Planned  | React Server Components / RSC  | [3.4.10](./3.4.10-rsc.md)             |
| **3.4.11** | ⏳ Planned  | React Integration              | [3.4.11](./3.4.11-integration.md)     |
| **3.4.12** | ⏳ Planned  | React Hardening                | [3.4.12](./3.4.12-hardening.md)       |

---

# Sub-phase Details

## 3.4.1 — React Rule Framework

Establish the foundational rule architecture.

### Scope

* React rule interface
* Rule registry
* Plugin abstraction
* React analysis context
* Rule execution model
* Finding integration
* Rule test infrastructure

### Status

✅ Complete

---

## 3.4.2 — React Semantic Analysis

Build semantic infrastructure required by React-specific rules.

### Scope

* AST React Hook detection
* Component boundary detection
* Custom Hook boundary detection
* JSX analysis
* Scope analysis
* Reference analysis
* Hook execution context
* Function boundaries
* Semantic metadata

### Status

✅ Complete

---

## 3.4.3 — React Hooks Intelligence

Detect correctness and lifecycle problems in React Hooks.

### Rules

#### `react.hooks.missing-deps`

* `useEffect`
* `useMemo`
* `useCallback`
* dependency extraction
* reference analysis
* dependency comparison
* false-positive protection

#### `react.hooks.stale-closure`

* captured render values
* asynchronous callbacks
* timers
* subscriptions
* closure analysis

#### `react.hooks.conditional`

* `if`
* ternary
* logical expressions
* loops
* early-return paths

#### `react.hooks.invalid-order`

* nested functions
* component boundary
* custom Hook boundary
* Rules of Hooks validation

#### `react.hooks.unnecessary-effect`

* derived state
* synchronous calculations
* unnecessary state synchronization

#### `react.hooks.async-effect`

* async effect callbacks
* cancellation
* cleanup
* race-condition patterns

### Integration

* Built-in React plugin
* Hook rule registration
* Registry integration
* Rule integration tests
* Regression fixtures

### Status

✅ Complete

---

## 3.4.4 — React Rendering Intelligence

Analyze React rendering behavior and avoidable rendering problems.

### Scope

* unnecessary re-renders
* unstable values
* unnecessary state updates
* parent-driven render patterns
* render-triggering patterns

### Memoization

* unnecessary `React.memo`
* ineffective memoization
* unstable props defeating memoization
* incorrect memo boundaries

### Callback behavior

* unnecessary `useCallback`
* unstable callbacks
* unnecessary callback recreation
* dependency misuse

### Props

* inline objects
* inline arrays
* inline functions
* unstable derived props
* receiving component boundary analysis

### Keys

* missing keys
* unstable keys
* inappropriate array-index keys
* duplicate key expressions

### Status

✅ Complete

---

## 3.4.5 — React State Intelligence

Analyze React state design and state transitions.

### Scope

* unnecessary state
* duplicated state
* derived state
* state synchronization
* state initialization
* state transition patterns

### Detection

* state that can be derived during render
* mirrored props/state
* redundant setters
* state update chains
* suspicious state ownership

### Status

✅ Complete

---

## 3.4.6 — React Performance Intelligence

Analyze React performance characteristics beyond rendering correctness.

### Scope

* expensive render calculations
* unnecessary memoization
* expensive Hook computations
* repeated allocations
* expensive component boundaries

### Detection

* expensive work during render
* avoidable repeated computation
* ineffective memoization
* high-cost component patterns
* performance-sensitive Hook usage

### Status

✅ Complete

---

## 3.4.7 — React Context Intelligence

Analyze React Context usage and propagation.

### Scope

* provider boundaries
* context value stability
* unnecessary context propagation
* excessive provider nesting
* context/state ownership

### Detection

* unstable provider values
* inline context values
* avoidable context updates
* consumers with excessive coupling
* context misuse

### Status

✅ Complete

---

## 3.4.8 — React Patterns Intelligence

Analyze common React ecosystem patterns and anti-patterns.

### React Query

Conditional analysis when React Query is detected.

* query key stability
* invalidation misuse
* mutation/query misuse
* unnecessary effects around query state
* stale query configuration

### Suspense

* ineffective Suspense boundaries
* incorrect fallback patterns
* loading-state assumptions

### Error Boundaries

* missing error boundaries
* ineffective error boundaries

### Common React Patterns

Detect high-confidence React anti-patterns that do not belong to another specialized module.

### Activation rule

Framework/library-specific rules must activate only when the relevant dependency or API can be identified.

### Status

⏳ Planned

---

## 3.4.9 — React Suspense Intelligence

Analyze Suspense-specific architecture and runtime behavior.

### Scope

* Suspense boundaries
* fallback behavior
* nested Suspense
* loading-state architecture
* async rendering boundaries

### Detection

* ineffective boundaries
* overly broad boundaries
* ineffective fallbacks
* incorrect loading assumptions
* problematic nesting

### Status

⏳ Planned

---

## 3.4.10 — React Server Components / RSC

Analyze React Server Components and client/server boundaries.

### Scope

* server/client boundaries
* client-only APIs
* server-only assumptions
* serialization boundaries
* component placement

### Detection

* invalid client/server usage
* incompatible Hook usage
* browser API usage in server components
* boundary violations
* serialization risks

### Status

⏳ Planned

---

## 3.4.11 — React Integration

Integrate React intelligence into the complete review pipeline.

### Scope

* React engine integration
* rule registry integration
* review engine integration
* finding aggregation
* deduplication
* severity handling
* confidence handling
* GitHub review integration

### Validation

* end-to-end React review
* multi-rule execution
* mixed AST + React findings
* regression suite

### Status

⏳ Planned

---

## 3.4.12 — React Hardening

Production hardening for the React intelligence engine.

### Scope

* false-positive reduction
* rule interaction
* performance optimization
* parser edge cases
* unsupported syntax handling
* regression fixtures
* deterministic behavior

### Quality

* strict TypeScript
* lint cleanliness
* deterministic output
* stable rule IDs
* complete test coverage
* performance regression checks

### Status

⏳ Planned

---

# Completion Criteria

Phase 3.4 is complete when all applicable sub-phases are complete and:

* React semantic analysis is stable
* React rules are registered through the plugin architecture
* Rules produce deterministic `ReviewFinding[]`
* Positive, negative, and regression fixtures exist
* React findings integrate with the review engine
* False-positive behavior is hardened
* Full validation passes

Required validation:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

# Status Legend

| Status     | Meaning                               |
| ---------- | ------------------------------------- |
| ✅ Complete | Implemented, tested, and validated    |
| 🚧 Active  | Current phase of development          |
| 📌 Next    | Next implementation target            |
| ⏳ Planned  | Planned for later                     |
| ⚠️ Blocked | Blocked by dependency or architecture |
