# Phase 7 — Continuous Review Intelligence & Reliability

> Engineering contract: [`../../AGENTS.md`](../../AGENTS.md)

Status: ⏳ Planned

Prerequisite: complete and freeze the Phase 6.11 evaluation expansion wave before production behavior changes begin.

---

## Objective

Evolve the reviewer from a production-capable static/AI review platform into a continuously improving review system whose quality is measurable, evidence-backed, calibrated, regression-safe, and increasingly adapted to real repositories without silently mutating production behavior.

Phase 7 is not primarily a rule-count expansion phase. Its goal is to maximize trust in review outcomes.

The desired developer experience is:

> If the reviewer blocks a pull request, the finding is very likely to be real and actionable. If the reviewer is uncertain, that uncertainty is explicit. When the reviewer is wrong, the failure becomes evidence that can improve a future candidate without automatically weakening production safeguards.

---

## Current Baseline

Phase 6 already provides the required foundation:

- versioned real-world evaluation harness
- repository context and project profiles
- dependency-aware incremental PR analysis
- stable finding identity, baselines, and suppressions
- GitHub review lifecycle integration
- performance/scale benchmarking
- bounded AI context and finding verification behavior
- developer feedback persistence and metrics
- production-readiness contracts and observability

Phase 6.11 is expanding the executable public-PR corpus and adjudicating emitted findings. Phase 7 must use that evidence instead of tuning production behavior against a small or incomplete denominator.

---

## Core Principles

1. **Measure before optimizing.** No production rule tuning should be justified by unadjudicated anecdotes.
2. **Precision dominates recall for blocking findings.** High-severity noise destroys reviewer trust faster than a missed advisory issue.
3. **Every important finding needs machine-verifiable evidence.** High severity without sufficient evidence must be downgraded, suppressed, or rejected.
4. **Try to disprove findings before publishing them.** Counterexample search is a first-class stage.
5. **AI proposes; deterministic systems verify whenever feasible.** AI does not become a bypass around analyzer or governance boundaries.
6. **Feedback creates evidence, not silent mutations.** Developer outcomes may create datasets and improvement candidates but must not directly rewrite rules, prompts, severities, project profiles, or mandatory policy.
7. **Candidates compete against production.** Improvements must win objective evaluation and regression gates before promotion.
8. **Shadow before visible rollout.** Changes that materially affect production findings should prove themselves on real traffic before they can block or comment.
9. **Repository adaptation is bounded.** Local history may influence priors and advisory behavior, but must not silently disable mandatory security or governance rules.
10. **One production review pipeline.** CLI, GitHub, CI, plugins, evaluation, shadow review, and future platform APIs must continue through the shared application boundary.

---

## Target Architecture

```text
Repository / PR
      │
      ├────────────── Repository History
      │                       │
      ├────────────── Project Profile
      │                       │
      └────────────── Repository Graph
                              │
                              ▼
                       Review Context
                              │
                              ▼
                    Deterministic Analysis
                              │
                         Candidates
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
              Data Flow   Call Graph   AI Hypothesis
                  │           │           │
                  └───────────┼───────────┘
                              ▼
                       Evidence Graph
                              │
                              ▼
                    Counterexample Search
                              │
                              ▼
                       Finding Verifier
                              │
                              ▼
                   Confidence Calibration
                              │
                              ▼
                       Review Decision
                              │
                              ▼
                          GitHub PR
                              │
                    Developer Outcomes
                              │
                              ▼
                       Outcome Dataset
                              │
                              ▼
                        Failure Mining
                              │
                              ▼
                  Improvement Candidates
                              │
                              ▼
             Evaluation → Tournament → Shadow
                              │
                              ▼
                       Promotion Gate
                              │
                              └────→ Reviewer vNext
```

---

## Target Quality Contract

These are end-state engineering targets, not current product guarantees.

| Metric | Target |
| --- | ---: |
| Review execution success | >= 99.9% |
| Deterministic stability for identical input/config | 100% |
| Rule crash rate on supported input | 0% |
| Blocking/high-severity precision | >= 98% |
| Overall actionable precision | >= 95% |
| Duplicate finding rate | < 1% |
| Unexplained high-severity findings | 0 |
| High-severity evidence coverage | 100% |
| Regression corpus pass rate | 100% |
| Semantic/metamorphic stability | >= 99% |
| Confidence calibration | explicitly measured and release-gated |
| Candidate promotion | no material protected-metric regression |

Where the corpus is insufficient to establish a metric statistically, reports must say `insufficient evidence` rather than infer a guarantee.

---

# Roadmap

## Wave A — Measure Truth

Wave A improves the quality measurement system before deeper analysis or self-improvement work.

### 7.1 — Ground Truth & Adjudication Expansion

Status: 📌 Next after Phase 6.11

Objective: turn the real-world corpus into a reliable ground-truth asset rather than a collection of interesting examples.

Scope:

- freeze the completed Phase 6.11 cohort before Phase 7 production changes
- grow the executable corpus toward 100, then 250, then 500 representative PRs over time
- diversify repositories, architectures, frameworks, PR sizes, and bug categories
- require explicit verdicts for every emitted finding used in precision calculations
- support verdicts including `true-positive`, `false-positive`, `duplicate`, `not-actionable`, `severity-too-high`, and `severity-too-low`
- preserve repository, PR URL, head SHA, fixture provenance, rationale, and adjudication metadata
- keep positive expectations and empirical negative controls independently measurable
- prevent pending/unreviewed findings from being counted as true positives

Initial exit gate:

- >= 100 executable PR cases
- >= 15 distinct repositories/projects where feasible
- >= 50 adjudicated positive bug expectations
- >= 40 empirical negative controls
- 100% of emitted findings used for precision reporting have verdicts
- no production rule changes mixed into the ground-truth expansion commit series

### 7.2 — Reliability Scorecard

Status: ⏳ Planned

Objective: make reviewer quality diagnosable by rule family and operating context, not only aggregate precision/recall.

Metrics should include:

- precision, recall, F1
- false-positive and false-negative rates
- duplicate rate
- severity accuracy
- actionability rate
- finding stability
- runtime and memory
- review success/fallback rates
- AI request/cost metrics when AI is enabled

Required dimensions:

- rule and rule family
- severity
- deterministic vs AI provenance
- language/framework/profile
- repository category
- PR size/change scope
- changed-line vs repository-context finding
- evaluation cohort

Acceptance criteria:

- reports can identify the highest-noise and highest-miss rule families
- protected metrics can be declared for release gating
- baseline snapshots are versioned and comparable across commits
- missing denominators are reported explicitly instead of coerced to zero

### 7.3 — Confidence Calibration

Status: ⏳ Planned

Objective: make confidence values empirically meaningful rather than arbitrary rule/model scores.

Inputs may include:

- rule historical precision prior
- evidence strength
- repository-context completeness
- deterministic/AI agreement
- verification result
- historical acceptance/actionability rate

Required evaluation:

- reliability buckets/diagrams
- Brier score where applicable
- Expected Calibration Error or equivalent calibration error
- calibration drift across rule families and repository profiles

Constraints:

- calibration must not allow low-quality historical feedback to silently suppress mandatory policy
- raw LLM self-confidence must never be treated as calibrated confidence by itself

### 7.4 — Evidence Graph & Finding Evidence Contract

Status: ⏳ Planned

Objective: represent why a finding is believed using structured evidence that can be verified, rendered, and tested.

Evidence kinds should be able to represent:

- syntax/AST evidence
- symbol/declaration references
- scope relations
- call-chain relations
- data-flow/control-flow relations
- configuration/profile evidence
- dependency/import relations
- repository-history evidence

Acceptance criteria:

- every high-severity production finding satisfies a machine-checkable evidence contract
- evidence locations are stable enough for evaluation and GitHub rendering
- evidence can be serialized without exposing unnecessary repository source
- missing/contradictory evidence affects verification/confidence rather than being ignored

---

## Wave B — Improve Reasoning

Wave B deepens deterministic semantics and verifies findings more aggressively before publishing them.

### 7.5 — Semantic Program Intelligence

Status: ⏳ Planned

Objective: evolve supported analysis from primarily local AST patterns toward cross-symbol and interprocedural reasoning where justified by measured failure classes.

Priority order:

1. stronger symbol and alias resolution
2. import/re-export resolution
3. control-flow graph primitives
4. def-use/data-flow primitives
5. call-graph construction
6. interprocedural summaries
7. targeted taint/resource/async lifecycle propagation

Constraints:

- implement reusable semantic primitives before adding many specialized rules
- do not build whole-program complexity unless evaluation evidence demonstrates value
- analyzer boundaries remain deterministic and LLM-free
- incremental review must reuse/cache semantic state where safe

### 7.6 — Finding Verification Pipeline

Status: ⏳ Planned

Objective: introduce an explicit candidate-to-finding verification pipeline.

Target flow:

```text
Analyzer / AI Candidate
        ↓
Structural Verification
        ↓
Repository Context Verification
        ↓
Contradiction Checks
        ↓
Baseline / Duplicate Checks
        ↓
Confidence Calibration
        ↓
Publish / Downgrade / Reject
```

AI-specific behavior:

- AI output is a hypothesis until supporting evidence is located
- deterministic verification is preferred when feasible
- unverifiable AI claims must not become blocking findings
- disagreement between AI and deterministic evidence must be represented explicitly

### 7.7 — Counterexample Engine

Status: ⏳ Planned

Objective: actively search for conditions that invalidate a candidate before emitting it.

Examples:

- immutable or locally bounded values
- guaranteed cleanup paths
- synchronous reconciliation that removes a lifecycle race
- explicit caps/bounds hidden behind wrappers
- framework invariants or configuration that make a generic pattern safe
- test/generated/example contexts where a production rule should not apply

Acceptance criteria:

- rules can register reusable counterexample predicates
- rejection/downgrade reasons are observable in diagnostics/evaluation
- counterexample logic is tested with positive and negative cases
- the mechanism reduces measured false positives without masking known positives

### 7.16 — Differential / Change-Introduced Analysis

Status: ⏳ Planned

Objective: reason about behavior introduced by the PR rather than treating the head tree as an isolated repository snapshot.

Examples:

- bounded queue becomes unbounded
- cleanup is removed
- permission check disappears
- stable dependency becomes unstable
- safe serializer changes to unsafe raw serialization

Acceptance criteria:

- base/head semantic summaries can be compared for selected high-value rules
- findings can state that a risky property is newly introduced or worsened
- unchanged pre-existing debt is not incorrectly attributed to the PR
- incremental fallback behavior remains deterministic

---

## Wave C — Continuous Learning

Wave C turns real developer outcomes into bounded, auditable improvement evidence.

### 7.8 — Developer Outcome Learning

Status: ⏳ Planned

Objective: aggregate Phase 6.9 feedback into reliable rule-quality signals without direct behavior mutation.

Inputs include existing actions such as:

- `accepted`
- `fixed`
- `false-positive`
- `ignored`
- `accepted-risk`
- `duplicate`
- `not-actionable`

Outputs should include per-rule/per-family:

- sample count
- false-positive rate
- actionable rate
- fix/accept rate
- duplicate rate
- confidence/severity calibration observations

Constraints:

- ignored findings are not automatically false positives
- feedback from one repository must not blindly generalize globally
- mandatory policy cannot be disabled by aggregate developer feedback

### 7.9 — Automated Failure Mining

Status: ⏳ Planned

Objective: identify repeated reviewer failure classes from adjudication and production outcomes.

Target opportunity types:

- false-positive cluster
- false-negative cluster
- duplicate cluster
- severity miscalibration
- non-actionable cluster
- context-selection failure
- performance/reliability regression

Acceptance criteria:

- opportunities carry sample counts and concrete finding/case references
- clustering output is reproducible for the same dataset/config
- small-sample opportunities are clearly labeled low confidence
- failure mining cannot directly alter production behavior

### 7.10 — Improvement Proposal Agent

Status: ⏳ Planned

Objective: use AI optionally to propose bounded improvements from verified failure clusters.

An improvement candidate should include:

- affected rule/family/component
- evidence-backed failure hypothesis
- proposed code/config/prompt change
- expected impact
- regression risk
- required new tests/fixtures
- evaluation cohorts that must be rerun

Safety contract:

- proposal generation is non-production
- the agent cannot directly change enabled production rules or governance policy
- generated code is treated like any other untrusted candidate and must pass normal engineering review/validation

### 7.11 — Regression Case Generation

Status: ⏳ Planned

Objective: convert trustworthy failures into durable evaluation cases so known failure classes are hard to reintroduce.

Flows:

```text
False Positive
    ↓
Source/Context Minimization
    ↓
Behavior-Preserving Fixture
    ↓
Human/Policy Verification
    ↓
Must-Not-Find Regression
```

```text
Missed Real Bug
    ↓
Source/Context Minimization
    ↓
Faithful Reproduction
    ↓
Human/Policy Verification
    ↓
Must-Find Regression
```

Constraints:

- minimization must not change the semantics that justify the verdict
- provenance must remain auditable
- auto-generated fixtures are pending until verified

### 7.12 — Candidate Tournament & Promotion Gates

Status: ⏳ Planned

Objective: require improvement candidates to outperform or match production across protected metrics before promotion.

Candidate vs production comparison should cover:

- precision/recall by severity and rule family
- high-severity precision
- known FN closure
- protected negative controls
- duplicate rate
- semantic stability
- runtime/memory
- review success rate
- AI cost where relevant

Default promotion policy:

- no protected high-severity precision regression
- no newly introduced critical false positive
- no regression on mandatory governance cases
- known positive fixes are demonstrated by dedicated regression cases
- deterministic stability remains 100%
- performance regression remains within the active budget

---

## Wave D — Safe Self-Improvement & Production Hardening

Wave D validates candidates on real traffic and adds bounded repository/historical adaptation.

### 7.13 — Shadow Review

Status: ⏳ Planned

Objective: execute candidate behavior against real reviews without publishing candidate findings to developers.

Requirements:

- production and candidate results are correlated by review identity
- shadow output is isolated from GitHub comments/check conclusions
- candidate-only, production-only, and changed findings are observable
- resource/cost limits prevent shadow mode from degrading production reliability
- promotion can require a minimum real-review sample size

### 7.14 — Repository-Adaptive Intelligence

Status: ⏳ Planned

Objective: learn bounded repository-specific priors and conventions while preserving global safety policy.

Repository profile may include:

- frameworks/runtime/tooling
- generated/test/example path conventions
- architecture/package boundaries
- repository-specific rule historical precision
- accepted-risk patterns with explicit scope

Constraints:

- adaptation is explainable and versioned
- mandatory security/governance controls cannot be silently disabled
- sparse repositories fall back to global priors
- repository-specific tuning does not contaminate global metrics

### 7.15 — Temporal & Historical Review Intelligence

Status: ⏳ Planned

Objective: use version-control and review history to improve context and avoid repeating known mistakes.

Potential signals:

- file/function churn
- previous findings and fixes
- repeated accepted risks
- prior false-positive clusters
- ownership/code-area history where available

Constraints:

- history is contextual evidence, not proof of correctness
- avoid storing unnecessary raw source in feedback/history records
- stale historical decisions must be distinguishable from current policy

### 7.17 — Metamorphic / Semantic Stability Testing

Status: ⏳ Planned

Objective: verify that findings survive semantics-preserving source transformations.

Transformations may include:

- identifier renaming
- import reordering
- formatting/comment changes
- helper extraction/inlining
- equivalent boolean/control rewrites
- equivalent destructuring/property access forms

Acceptance criteria:

- transformation suites are deterministic
- known semantic findings remain stable under supported transformations
- failures identify brittle rules/primitives for repair
- target semantic stability is >= 99% on the maintained metamorphic suite

### 7.18 — Adversarial Reviewer Testing

Status: ⏳ Planned

Objective: deliberately construct difficult-but-valid code shapes that expose analyzer blind spots or false positives before real repositories do.

Priority adversarial patterns:

- aliasing and re-exports
- wrapper/higher-order functions
- dynamic imports
- generics and overloads
- optional chaining/destructuring
- custom React hooks and framework wrappers
- async races/resource lifetime boundaries
- monorepo/package boundaries
- test/generated/example code

Acceptance criteria:

- adversarial corpus is versioned separately from normal regression fixtures
- discovered production bugs become ordinary regression cases after verification
- evaluation-only identifiers never leak into production rule logic

### 7.19 — Reviewer Trust Policy

Status: ⏳ Planned

Objective: encode which findings may block, comment, or remain advisory based on measured reliability.

Recommended end-state policy:

- blocking/high severity: target precision >= 98%
- medium: target precision >= 90% before aggressive surfacing
- low/advisory: may accept more recall-oriented behavior
- insufficient evidence: cannot qualify a rule/family for blocking solely from theoretical confidence

Policy requirements:

- threshold decisions use calibrated and versioned metrics
- governance-required findings may have separate explicit policy
- release reports explain why a family is eligible/ineligible for blocking
- trust policy is centralized rather than duplicated across adapters

### 7.20 — Production Reliability SLO & Continuous Quality Gate

Status: ⏳ Planned

Objective: turn reviewer quality and execution reliability into enforceable release criteria.

SLO/quality signals include:

- review success rate
- rule crash rate
- incremental fallback rate
- GitHub/API/provider failure rate
- P50/P95/P99 latency
- memory and repository-context size
- AI timeout/cost where enabled
- finding stability
- precision/recall/actionability for sufficiently adjudicated cohorts
- confidence calibration drift
- shadow candidate deltas

Acceptance criteria:

- release validation fails on protected quality regressions
- quality gates distinguish statistically insufficient evidence from measured pass/fail
- operational SLOs and finding-quality gates are reported separately
- historical quality reports are retained for trend analysis

---

## Execution Order

Phase 7 should be executed in this order unless a later plan explicitly changes dependencies:

```text
Complete Phase 6.11
        ↓
7.1 Ground Truth & Adjudication
        ↓
7.2 Reliability Scorecard
        ↓
7.3 Confidence Calibration
        ↓
7.4 Evidence Contract
        ↓
┌────────────────────────────────────┐
│ Wave B                             │
│ 7.5 Semantic Intelligence          │
│ 7.6 Finding Verification           │
│ 7.7 Counterexample Engine          │
│ 7.16 Differential Analysis         │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ Wave C                             │
│ 7.8 Outcome Learning               │
│ 7.9 Failure Mining                 │
│ 7.10 Improvement Proposal Agent    │
│ 7.11 Regression Generation         │
│ 7.12 Candidate Tournament          │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ Wave D                             │
│ 7.13 Shadow Review                 │
│ 7.14 Repository Adaptation         │
│ 7.15 Historical Intelligence       │
│ 7.17 Metamorphic Tests             │
│ 7.18 Adversarial Testing           │
│ 7.19 Reviewer Trust Policy         │
│ 7.20 Production Quality SLO        │
└────────────────────────────────────┘
```

Wave B may incrementally introduce semantic primitives while Wave A evaluation infrastructure is being extended, but production finding behavior must not be tuned against unfinished/unadjudicated Phase 6.11 data.

---

## Self-Improvement Safety Contract

Phase 7 intentionally separates learning from production mutation.

The system MAY automatically:

- aggregate feedback
- compute metrics
- identify failure clusters
- generate candidate regression fixtures
- propose candidate code/rule/prompt changes
- run candidate evaluation
- run shadow review
- produce promotion recommendations

The system MUST NOT automatically:

- disable mandatory governance/security rules
- rewrite production rules directly from developer feedback
- change severity thresholds without versioned policy
- promote an AI-generated change that has not passed required validation
- count pending/unadjudicated findings as proven true positives
- hide quality regressions by changing evaluation-only mappings
- specialize production rules to PR numbers, fixture IDs, or evaluation paths

Production promotion requires an explicit, auditable promotion action governed by the repository's normal engineering workflow.

---

## Validation Expectations

Every implementation sub-phase must run the repository validation relevant to its scope. At minimum, behavior-affecting changes must preserve:

```bash
npm run typecheck
npm run lint
npm run test:evaluation
npm test
npm run build
```

Additional gates should be added as their corresponding Phase 7 capabilities land, including calibration reports, metamorphic suites, candidate tournaments, shadow comparisons, and protected reliability thresholds.

---

## Non-Goals

Phase 7 does not authorize:

- uncontrolled online model training or fine-tuning from repository source
- autonomous production code commits to reviewed repositories
- automatic merging of reviewer self-modifications
- replacing deterministic analysis with LLM agents
- weakening governance because a repository frequently suppresses findings
- arbitrary-language expansion without a dedicated architecture/evaluation plan
- optimizing metrics by overfitting to known evaluation fixture identities

---

## Phase 7 Completion Criteria

Phase 7 is complete only when the platform demonstrates a closed, measurable, regression-safe improvement loop:

- [ ] real-world ground truth is sufficiently large and fully adjudicated for protected metrics
- [ ] reliability scorecards identify quality by rule/family/context
- [ ] confidence is empirically calibrated and drift is observable
- [ ] high-severity findings satisfy structured evidence requirements
- [ ] semantic primitives support measured cross-file/interprocedural failure classes
- [ ] candidates pass explicit verification and counterexample stages
- [ ] developer outcomes feed versioned quality datasets without direct mutation
- [ ] repeated failure classes are mined into auditable improvement opportunities
- [ ] candidate improvements can generate verified regression coverage
- [ ] production vs candidate tournaments enforce protected metrics
- [ ] material candidates run in shadow before visible/blocking rollout
- [ ] repository/history adaptation is bounded by global governance
- [ ] differential analysis can identify selected change-introduced risks
- [ ] maintained findings meet the semantic-stability target
- [ ] adversarial testing continuously challenges analyzer assumptions
- [ ] trust policy determines blocking eligibility from measured reliability
- [ ] production quality/SLO gates prevent reliability regressions
- [ ] no self-improvement path silently changes production behavior
