# Continuous Review Intelligence

The Phase 7 operator uses the shared application review pipeline and persists metadata-only learning events. Normal CLI/GitHub review entry points retain their existing persistence behavior; automatic recording applies to reviews operated through this entry point or an explicitly composed learning service. It does not train a model or deploy candidate code.

## Repository and PR review

```bash
npm run review:intelligence -- repository snapshot.json /tmp/reviewer-learning
npm run review:intelligence -- pr pull-request.json /tmp/reviewer-learning
```

A repository manifest contains `repositoryId`, `snapshotId`, `files` (`path`, `content`), `expectedPaths`, and human-reviewed `expectedFindings` (`id`, `ruleId`, `severity`, optional `file`/`line`). Optional `unsupportedPaths` and `contextBudget` describe capture limitations. Include configuration/import context in the inventory. The operator validates paths and never infers that a caller-supplied inventory includes every upstream file.

A PR manifest contains `id`, `title`, `base` and `head` repository manifests, `expectedIntroducedFindings`, and optional exact `changes`. The evaluator compares introduced, worsened, baseline and resolved findings and checks incremental/full-head parity. Incomplete capture, unsupported code, unresolved local imports, parse failures, context truncation and requested AI failures cannot produce a complete clean pass.

Output includes `reviewRunId`. Each operated review, including zero findings and incomplete results, records only repository/snapshot identity and finding fingerprints. Source remains in the caller's capture, not the learning journal. Expected findings are evaluation labels; an empty expectation list is appropriate for a vetted negative control, not proof that an unadjudicated repository is clean.

Exit codes: `0` means the operation/evaluation passed, `1` means failed or insufficient/incomplete qualification, `2` means invalid input or operational error.

## Outcomes and candidates

```bash
npm run review:intelligence -- event outcome.json /tmp/reviewer-learning
npm run review:intelligence -- event adjudicated-outcome.json /tmp/reviewer-learning --authorize-adjudication
npm run review:intelligence -- failures /tmp/reviewer-learning owner/repository
npm run review:intelligence -- production /tmp/reviewer-learning
```

Events use schema `version: 1` and a unique `eventId`/`recordedAt`. Contracts are exported from `src/application/improvement`. Outcome events reference a recorded review, repository, stable finding fingerprint and rule. Explicit `missed-bug` events may reference zero-finding reviews. Verified labels require adjudicator/evidence references and a trusted verifier; the local operator's explicit adjudication flag authorizes manually audited imports. Ordinary client booleans cannot silently become verified ground truth.

Accepted then fixed actions count as one outcome. Conflicting/untrusted labels remain pending until an adjudicator explicitly supersedes them. Ignored/accepted-risk events are separate descriptive signals, not correctness labels. Failure mining is reproducible and repository-scoped; small clusters remain low confidence.

Candidate events reference verified failures, current parent version, an immutable local `artifactRef` and its SHA-256 digest. Artifact text is never executed. Regression events are human-verified `must-find`/`must-not-find` references, not automatically generated proof. Candidate evaluation imports are reevaluated from the actual referenced bundle; caller-supplied `status: pass` is discarded.

## Protected quality and source audits

```bash
npm run review:intelligence -- quality bundle.json --authorize-quality-evidence
```

The bundle follows `PromotionQualityInput`: candidate/artifact/baseline/dataset identity, rule family, candidate exposure, development/calibration/protected holdout manifest, approved policy and complete paired candidate/production counts. Cohorts must be disjoint by repository and strictly separated by time. Already inspected Phase 6 fixtures cannot become unseen holdout by relabeling.

The local operator enforces immutable policy `phase-7-trust-v1`: actionable precision >=95%, blocking precision >=98%, recall >=90%, no recall/protected-positive/negative-control regression, and no critical false positive. It requires at least 100 cases, 15 repositories, 50 positive expectations, 40 negative controls, 75 emitting precision repositories and 190 emitting blocking repositories. The latter gates are conservative: the fixed two-sided 95% Wilson interval treats each repository as one binary clean-repository unit. It is not a finding-level precision confidence interval; both the repository bound and observed finding precision must meet their floors. A bundle cannot lower thresholds under the same policy version.

Each `snapshotRef` resolves to a complete repository capture. Each `adjudicationRef` resolves to a manually reviewed JSON audit with `schemaVersion: 1`, matching `caseId`, `repositoryId`, `observedAt`, `ruleFamily`, `candidateId`, `artifactDigest`, `baselineVersion` (string), `datasetVersion`, `policyVersion`, `verdictsComplete: true`, `adjudicatorId`, 40-character `sourceHeadSha`, and `snapshotDigest` (SHA-256 of exact capture bytes). Audit `candidate` and `production` counts must match the bundle. These are human-audited external execution/label imports; identity/integrity/completeness checks do not prove candidate code execution or upstream snapshot fidelity automatically. A trusted deployment evaluator should supply those audits.

Missing samples, pending labels, synthetic/invalid source, unauthorized audits or incomplete runs remain ineligible. The file receipt rehashes the registered candidate artifact and resolves audits again at promotion to reject swapped or changed evidence.

## Shadow and release journal

`runIsolatedShadow` accepts trusted production/candidate application compositions, checks source/file budgets and deadlines, and returns a bound verifier receipt without a publisher. It reports `hardResourceIsolation: false`: synchronous AST work cannot be forcibly preempted by this application helper. A production process adapter is needed for hard CPU/memory isolation. Local `shadow` event imports require `--authorize-shadow` after auditing actual execution.

```bash
npm run review:intelligence -- event evaluation.json /tmp/reviewer-learning --authorize-quality-evidence
npm run review:intelligence -- event shadow.json /tmp/reviewer-learning --authorize-shadow
npm run review:intelligence -- promote /tmp/reviewer-learning candidate-id actor approval-ref --authorize-release --authorize-quality-evidence
npm run review:intelligence -- rollback /tmp/reviewer-learning 0 actor rollback-approval --authorize-release
```

Promotion requires verified regressions, an independent passing bound quality receipt, no pending/superseded failure evidence, three distinct audited shadow reviews within the latency budget, and explicit authorization. It updates the approved artifact journal; code deployment remains the normal engineering workflow. Rollback appends a new release version referring to a retained prior artifact. The immutable genesis is loaded from the journal after restart, so source updates do not prevent history access or rollback.

The file adapter uses restricted metadata files, fsync, an exclusive writer lock and optimistic revisions. Concurrent release attempts cannot both succeed. A crashed writer may leave `.writer-lock`; inspect the pending revision before clearing it manually. Directly modifying journal files is outside the trusted service boundary.

## CI evidence

`npm run evaluation:reliability-report` emits corpus and synthetic repository/PR observations. CI uploads this report alongside tests/coverage and existing artifacts. Reporting exits successfully even when qualification is insufficient; the `quality`/`promote` operations enforce refusal separately. The current corpus has six invalid-fixture findings across two quarantined captures, so production precision remains unqualified. Synthetic passing tests establish integration behavior, not real-world 98% precision.

`npm run evaluation:phase7-report` emits the versioned scorecard, calibration diagnostics, operational SLO assessment, semantic program summaries and metamorphic/adversarial report. CI fails only if a maintained supported transformation becomes unstable; known capability gaps and insufficient sample sizes remain explicit report data and block promotion rather than being relabeled as passes.

The local operator also exposes diagnostic report commands:

```bash
npm run review:intelligence -- scorecard scorecard-input.json
npm run review:intelligence -- calibration calibration-input.json
npm run review:intelligence -- calibration-drift comparison.json
npm run review:intelligence -- slo slo-input.json
npm run review:intelligence -- semantic adversarial-corpus.json
npm run review:intelligence -- proposals /tmp/reviewer-learning owner/repository dataset-v1
npm run review:intelligence -- adaptation /tmp/reviewer-learning owner/repository profile-v1
```

These commands validate external JSON strictly. Standalone scorecard/calibration/SLO output is diagnostic evidence; it does not create a promotion receipt. `fitEmpiricalCalibrator` accepts labels only through an injected trusted verification port and records the calibration cohort exposure. Sparse family/profile/provenance bins return no probability. Raw model confidence and deterministic detection certainty are retained as separate fields.

`createReliableReviewUseCases` is the explicit evidence-and-trust composition. It binds analyzer-owned facts to exact findings, evaluates registered counterexamples, and consults versioned empirical trust policy before allowing high severity to block. Missing measured trust remains advisory. Mandatory rules fail closed if evidence, parsing or analyzer execution is incomplete. Existing entry points are not silently switched before their rule families qualify.

Candidate tournaments rerun production and candidate compositions through repository and base/head/incremental paths, repeat the actual PR request, include decisions/warnings/security gates in stability identity, measure total execution time, enforce deadlines, and require protected quality, calibration and semantic evidence. They report `hardResourceIsolation: false`; the deadline can reject late asynchronous work but cannot preempt synchronous CPU or enforce memory limits. Production shadowing still needs a dedicated process/container adapter before automatic rollout.
