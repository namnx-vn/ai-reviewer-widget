# AI Reviewer v1 Production Contract

This document defines the compatibility and release boundary for adopting the reviewer on production repositories.

## Versioning Policy

The package follows semantic-release intent:

- **patch** — bug fixes that do not intentionally break a public contract;
- **minor** — backward-compatible capabilities and additive schema fields where readers can safely ignore them;
- **major** — intentional breaking changes to public behavior or contracts.

Persisted and externally exchanged schemas are versioned independently of the npm package. A package minor release does not imply a persisted schema version change.

## Stable v1 Surfaces

The production-facing v1 boundary includes:

- CLI commands, documented options, and exit-code semantics;
- `.ai-reviewer.json` configuration schema (`version: 1`);
- review findings/results and GitHub/SARIF projection behavior;
- Phase 6 stable finding fingerprint (`finding-v1-*`);
- React/plugin contribution contracts already exposed by the package architecture;
- platform request/response schema (`version: 1`);
- review-history snapshot schema (`schemaVersion: 1`);
- finding baseline schema (`version: 1`);
- organization governance policy schema (`schemaVersion: 1`);
- developer feedback schema (`version: 1`).

Additive implementation details that are not exported/public contracts remain free to evolve without a major release.

## Migration and Rejection Policy

### Configuration

`resolveReviewConfiguration()` accepts only schema version 1. Unsupported versions produce an explicit configuration diagnostic and are never silently treated as v1. A future config v2 must have an explicit migration or a dedicated v2 resolver.

### Finding Baselines

`assertSupportedBaseline()` rejects baseline versions other than 1. A future migration must produce a new immutable baseline value; readers must not reinterpret an unknown version.

### Review History

`assertSupportedReviewHistorySchema()` rejects unknown persisted review-history versions. Storage adapters may migrate a snapshot before passing it to v1 application services, but application services do not silently coerce unknown versions.

### Developer Feedback

`assertSupportedDeveloperFeedbackSchema()` rejects unknown feedback versions. Feedback records remain observation data and do not automatically mutate rules, profiles, severities, prompts, or governance.

### Governance Policy

`assertSupportedOrganizationPolicySchema()` rejects unknown organization-policy versions. Policy migration must preserve provenance and mandatory controls explicitly.

## Finding Identity Compatibility

`finding-v1-*` fingerprints are the stable Phase 6 identity contract. Ordinary line movement does not alter identity. Any intentional fingerprint algorithm change requires a new identity prefix/version and an explicit mapping policy for baselines, GitHub lifecycle state, and developer feedback.

## CLI and Exit Codes

The packed CLI is the release artifact. Existing command validation and package installation tests are release gates. Exit-code meanings must remain backward compatible within v1; adding a new failure class must not reinterpret an existing code.

## GitHub and SARIF

GitHub publication consumes shared `ReviewResult` output. Publication failure never changes analyzer/scoring decisions. Repeated PR pushes use stable finding identity to avoid duplicate lifecycle output. Check Run annotations are bounded explicitly. SARIF is a projection of shared review findings rather than a separate review pipeline.

## Release Validation

A v1 release candidate must pass:

```text
npm run typecheck
npm run lint
npm run test:coverage
npm run test:e2e
npm run test:package
npm run build
npm run security:secrets
npm audit --audit-level=high
npm run test:evaluation
npm run evaluation:report
npm run benchmark:review -- medium
```

GitHub Actions runs the security, evaluation, quality-report, benchmark, coverage, build, packed-package, and e2e gates on the shared application pipeline.

## Quality Reporting

Phase 6 evaluation metrics are engineering targets, not product guarantees. Precision, recall, false positives, duplicate rate, stability, severity accuracy, and runtime are represented by the evaluation harness. Evaluation and performance results are stored as CI artifacts. A target that cannot be statistically supported by the current corpus must be reported as **insufficient evidence**, not claimed as passing.

The smoke corpus currently provides deterministic pipeline/stability coverage but is not sufficient evidence for the real-world high-severity precision target. This limitation is explicit rather than converted into a misleading production guarantee.

## Known Limitations

- Deterministic rules default to repository-wide execution unless they explicitly declare a narrower safe execution scope. This preserves correctness but means incremental review is not yet maximally faster for all rule families.
- The synthetic medium benchmark is reproducible and useful for regression detection, but it is not a substitute for a diverse real-world corpus.
- Feedback storage currently has an in-memory reference adapter; production persistence is intentionally vendor-neutral behind application ports.
- AI verification is evidence-aware but cannot deterministically prove every architectural observation; unverifiable findings follow explicit confidence behavior.
- The current product focuses on the repository/languages supported by existing deterministic analyzers; Phase 6 does not promise arbitrary-language coverage.

## v1 Release Checklist

Validated by GitHub Actions run `33746987515` on commit `c63daf079c3eede9ae5ffabc8677352cf18ed3d6`:

- [x] `develop` release candidate CI is fully green.
- [x] dependency audit contains no critical/high vulnerabilities.
- [x] secret scan passes.
- [x] evaluation smoke passes and quality metrics are reported without unsupported claims.
- [x] medium benchmark completes below the current Phase 6 target and artifact is retained.
- [x] packed CLI installation/package test passes on the release CI environment.
- [x] GitHub publication tests cover lifecycle and partial failure behavior.
- [x] persisted/external schema guards reject unsupported versions.
- [x] known limitations are documented for release notes.
- [x] no adapter bypasses the shared application review pipeline.
- [x] Phase 6.10 implementation passed the release-validation CI before Phase 6 was marked complete.
