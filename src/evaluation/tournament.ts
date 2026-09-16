import type { AIReviewerPort, ReviewUseCases } from "../application/review";
import { fingerprintReviewFinding, type ReviewResult } from "../domain/review";
import { evaluatePromotionQuality, type PromotionQualityInput, type PromotionQualityResult } from "./quality-gates";
import { evaluatePullRequestReview, evaluateRepositoryReview, type PullRequestEvaluationInput,
  type PullRequestReviewEvaluation, type RepositoryReviewEvaluation } from "./repository-review";
import { buildCalibrationReport, compareCalibrationReports, type CalibrationInput, type CalibrationGatePolicy } from "./calibration";
import { runSemanticStabilityEvaluation, type SemanticStabilityCorpus } from "./semantic-stability";

export interface TournamentCandidate {
  readonly candidateId: string;
  readonly artifactDigest: string;
  readonly baselineVersion: string;
  readonly datasetVersion: string;
  /** Reviewed, trusted composition. This harness never loads or executes artifact text. */
  readonly useCases: ReviewUseCases;
  readonly aiReviewer?: AIReviewerPort;
}
export interface TournamentPolicy {
  readonly policyVersion: string;
  readonly minimumCases: number;
  readonly minimumRepositories: number;
  readonly maximumRuntimeRegression: number;
  readonly maximumDuplicateRate: number;
  readonly minimumStability: 1;
  readonly minimumSemanticComparisons?: number;
  readonly maximumExecutionDurationMs?: number;
}
export interface TournamentAuditRequest {
  readonly candidate: Omit<TournamentCandidate, "useCases" | "aiReviewer">;
  readonly runs: readonly { readonly caseId: string; readonly production: PullRequestReviewEvaluation;
    readonly candidate: PullRequestReviewEvaluation; readonly repository: RepositoryReviewEvaluation }[];
}
export interface TournamentAdjudicationPort {
  /** Independently audits source fidelity, all verdicts and exact execution identities. Defaults to absent. */
  evaluate(request: TournamentAuditRequest): Promise<{ readonly verified: boolean; readonly input: PromotionQualityInput;
    readonly calibration?: { readonly current: CalibrationInput; readonly baseline: CalibrationInput; readonly policy: CalibrationGatePolicy } }>;
}
export interface TournamentRun {
  readonly caseId: string;
  readonly repositoryId: string;
  readonly contextComplete: boolean;
  readonly executionSucceeded: boolean;
  readonly parity: boolean;
  readonly stability: boolean;
  readonly runtimeMs: number | null;
  readonly productionRuntimeMs: number | null;
  readonly duplicateRate: number | null;
}
export interface TournamentCandidateResult extends Omit<TournamentCandidate, "useCases" | "aiReviewer"> {
  readonly operationalStatus: "pass" | "fail";
  readonly qualificationStatus: "pass" | "fail" | "insufficient-evidence";
  readonly stability: number | null;
  readonly quality: PromotionQualityResult | null;
  readonly reasons: readonly string[];
  readonly runs: readonly TournamentRun[];
}

function signature(result: ReviewResult): string {
  return JSON.stringify([result.decision, result.score, result.securityQualityGate, result.warnings, result.findings.map((finding) => JSON.stringify([
    fingerprintReviewFinding(finding), finding.location, finding.severity, finding.confidence,
  ])).sort()]);
}
function duplicateRate(result: ReviewResult): number | null {
  if (!result.findings.length) return null;
  const keys = result.findings.map((finding) => JSON.stringify([fingerprintReviewFinding(finding), finding.location]));
  return (keys.length - new Set(keys).size) / keys.length;
}
function validRuntime(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function assertInput(input: { readonly candidates: readonly TournamentCandidate[];
  readonly cases: readonly PullRequestEvaluationInput[]; readonly policy: TournamentPolicy }): void {
  const p = input.policy;
  if (!p.policyVersion.trim() || ![p.minimumCases, p.minimumRepositories].every((n) => Number.isSafeInteger(n) && n > 0)
    || !Number.isFinite(p.maximumRuntimeRegression) || p.maximumRuntimeRegression < 0
    || !Number.isFinite(p.maximumDuplicateRate) || p.maximumDuplicateRate < 0 || p.maximumDuplicateRate > 1
    || p.minimumStability !== 1 || !Number.isSafeInteger(p.minimumSemanticComparisons ?? 100)
    || (p.minimumSemanticComparisons ?? 100) < 1 || !Number.isFinite(p.maximumExecutionDurationMs ?? 5000)
    || (p.maximumExecutionDurationMs ?? 5000) <= 0) throw new Error("Invalid tournament policy.");
  if (!input.candidates.length || input.candidates.length > 20 || input.cases.length > 1000) throw new Error("Tournament size budget exceeded.");
  if (new Set(input.candidates.map((c) => c.candidateId)).size !== input.candidates.length
    || new Set(input.cases.map((c) => c.id)).size !== input.cases.length) throw new Error("Tournament identities must be unique.");
  const baseline = input.candidates[0];
  for (const c of input.candidates) {
    if (!c.candidateId.trim() || !/^[a-f0-9]{64}$/.test(c.artifactDigest) || !c.baselineVersion.trim() || !c.datasetVersion.trim()) throw new Error("Invalid candidate identity.");
    if (c.baselineVersion !== baseline.baselineVersion || c.datasetVersion !== baseline.datasetVersion) throw new Error("Candidates must share baseline and dataset versions.");
  }
}
function assertAuditBinding(input: PromotionQualityInput, candidate: TournamentCandidate, runs: TournamentAuditRequest["runs"]): void {
  if (input.candidateId !== candidate.candidateId || input.artifactDigest !== candidate.artifactDigest
    || input.baselineVersion !== candidate.baselineVersion || input.datasetVersion !== candidate.datasetVersion
    || input.cases.length !== runs.length) throw new Error("Tournament audit identity mismatch.");
  for (const c of input.cases) {
    const run = runs.find((r) => r.caseId === c.caseId);
    if (!run || c.repositoryId !== run.candidate.head.repositoryId || c.snapshotRef !== run.candidate.head.snapshotId
      || !c.executionSucceeded || !c.contextComplete || run.candidate.completeness.status !== "complete"
      || run.production.completeness.status !== "complete" || run.repository.completeness.status !== "complete"
      || !run.candidate.parity || !run.production.parity) throw new Error("Tournament audit execution mismatch.");
  }
}

/** Compare candidates without changing production, publishing results, or accepting caller-supplied pass flags. */
export async function runCandidateTournament(input: {
  readonly production: ReviewUseCases;
  readonly productionAIReviewer?: AIReviewerPort;
  readonly candidates: readonly TournamentCandidate[];
  readonly cases: readonly PullRequestEvaluationInput[];
  readonly policy: TournamentPolicy;
  readonly adjudication?: TournamentAdjudicationPort;
  readonly semanticCorpus?: SemanticStabilityCorpus;
  readonly now?: () => number;
}): Promise<{ readonly schemaVersion: 1; readonly policyVersion: string;
  readonly candidates: readonly TournamentCandidateResult[]; readonly recommendation: string | null;
  readonly hardResourceIsolation: false }> {
  assertInput(input);
  const now = input.now ?? (() => performance.now());
  const maximumDuration = input.policy.maximumExecutionDurationMs ?? 5000;
  // Reject late asynchronous work. Trusted in-process AST work still needs a process adapter for hard termination.
  async function bounded<T>(operation: () => T | Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = now();
    try {
      const result = await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Tournament execution deadline exceeded.")), maximumDuration);
      })]);
      if (now() - start > maximumDuration) throw new Error("Tournament execution deadline exceeded.");
      return result;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  const production = new Map<string, PullRequestReviewEvaluation>();
  const productionDurations = new Map<string, number>();
  const productionFailures = new Set<string>();
  for (const c of input.cases) {
    try { const start = now();
      production.set(c.id, await bounded(() => evaluatePullRequestReview(input.production, c, input.productionAIReviewer)));
      productionDurations.set(c.id, now() - start);
    }
    catch { productionFailures.add(c.id); }
  }
  const results: TournamentCandidateResult[] = [];
  for (const candidate of [...input.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const runs: TournamentRun[] = [];
    const auditedRuns: TournamentAuditRequest["runs"][number][] = [];
    const failures: string[] = [];
    const missing: string[] = [];
    for (const c of input.cases) {
      try {
        const baseline = production.get(c.id);
        if (!baseline || productionFailures.has(c.id)) throw new Error("Production execution unavailable.");
        const start = now();
        const changed = await bounded(() => evaluatePullRequestReview(candidate.useCases, c, candidate.aiReviewer));
        const measuredDuration = now() - start;
        const repository = await bounded(() => evaluateRepositoryReview(candidate.useCases, c.head, candidate.aiReviewer));
        const repeat = await bounded(() => evaluateRepositoryReview(candidate.useCases, c.head, candidate.aiReviewer));
        const repeatPR = await bounded(() => evaluatePullRequestReview(candidate.useCases, c, candidate.aiReviewer));
        const stability = signature(repository.result) === signature(repeat.result)
          && signature(changed.base.result) === signature(repeatPR.base.result)
          && signature(changed.head.result) === signature(repeatPR.head.result)
          && signature(changed.incremental) === signature(repeatPR.incremental);
        const contextComplete = [baseline.completeness, changed.completeness, repository.completeness, repeat.completeness, repeatPR.completeness]
          .every((coverage) => coverage.status === "complete");
        const parity = baseline.parity && changed.parity && repeatPR.parity;
        const runtimeMs = validRuntime(measuredDuration);
        const productionRuntimeMs = validRuntime(productionDurations.get(c.id) ?? NaN);
        const duplicates = duplicateRate(changed.head.result);
        runs.push({ caseId: c.id, repositoryId: c.head.repositoryId, executionSucceeded: true, contextComplete,
          parity, stability, runtimeMs, productionRuntimeMs, duplicateRate: duplicates });
        auditedRuns.push({ caseId: c.id, production: baseline, candidate: changed, repository });
        if (!contextComplete) failures.push(`${c.id}: incomplete review context`);
        if (!parity) failures.push(`${c.id}: incremental parity regression`);
        if (!stability) failures.push(`${c.id}: deterministic stability regression`);
        if (duplicates !== null && duplicates > input.policy.maximumDuplicateRate) failures.push(`${c.id}: duplicate rate exceeded`);
        if (runtimeMs === null || productionRuntimeMs === null || productionRuntimeMs === 0) missing.push(`${c.id}: runtime denominator unavailable`);
        else if (runtimeMs > productionRuntimeMs * (1 + input.policy.maximumRuntimeRegression)) failures.push(`${c.id}: runtime budget regressed`);
        if (candidate.aiReviewer || input.productionAIReviewer) missing.push(`${c.id}: independent AI cost/provider-variation evidence required`);
      } catch {
        failures.push(`${c.id}: review execution failed`);
        runs.push({ caseId: c.id, repositoryId: c.head.repositoryId, executionSucceeded: false,
          contextComplete: false, parity: false, stability: false, runtimeMs: null, productionRuntimeMs: null, duplicateRate: null });
      }
    }
    if (runs.length < input.policy.minimumCases) missing.push("Insufficient tournament cases");
    if (new Set(runs.map((r) => r.repositoryId)).size < input.policy.minimumRepositories) missing.push("Insufficient independent tournament repositories");
    if (input.semanticCorpus) {
      try {
        const corpus = input.semanticCorpus;
        const semantic = await bounded(() => runSemanticStabilityEvaluation(candidate.useCases, corpus));
        if (semantic.summary.status !== "passed") failures.push("Semantic/adversarial regression suite failed or incomplete");
        if ((semantic.summary.semanticStability ?? 0) < 0.99) failures.push("Semantic stability below floor");
        if (semantic.summary.supportedComparisons < (input.policy.minimumSemanticComparisons ?? 100)) missing.push("Insufficient supported semantic comparisons");
      } catch {
        failures.push("Semantic/adversarial evaluation failed or exceeded its deadline");
      }
    } else missing.push("Protected semantic/adversarial suite unavailable");
    let quality: PromotionQualityResult | null = null;
    if (input.adjudication && auditedRuns.length === input.cases.length) {
      try {
        const adjudication = input.adjudication;
        const audit = await bounded(() => adjudication.evaluate({ candidate: { candidateId: candidate.candidateId,
          artifactDigest: candidate.artifactDigest, baselineVersion: candidate.baselineVersion, datasetVersion: candidate.datasetVersion }, runs: auditedRuns }));
        assertAuditBinding(audit.input, candidate, auditedRuns);
        quality = evaluatePromotionQuality(audit.input);
        if (audit.calibration) {
          const { current, baseline, policy } = audit.calibration;
          if (current.modelVersion !== candidate.artifactDigest || baseline.modelVersion !== candidate.baselineVersion
            || current.datasetVersion !== candidate.datasetVersion || baseline.datasetVersion !== candidate.datasetVersion) throw new Error("Calibration execution identity mismatch.");
          const drift = compareCalibrationReports(buildCalibrationReport(current), buildCalibrationReport(baseline), policy);
          if (drift.status === "fail") failures.push("Protected confidence calibration regressed");
          else if (drift.status !== "pass") missing.push("Protected confidence calibration evidence insufficient");
        } else missing.push("Independently verified confidence calibration unavailable");
        if (!audit.verified) missing.push("Tournament source and verdicts are not independently verified");
        if (quality.qualityStatus === "fail") failures.push(...quality.reasons);
        else if (quality.qualityStatus !== "pass") missing.push(...quality.reasons);
      } catch { missing.push("Tournament audit unavailable or mismatched"); }
    } else missing.push("Independent protected adjudication unavailable");
    results.push({ candidateId: candidate.candidateId, artifactDigest: candidate.artifactDigest,
      baselineVersion: candidate.baselineVersion, datasetVersion: candidate.datasetVersion,
      operationalStatus: runs.every((r) => r.executionSucceeded && r.contextComplete) ? "pass" : "fail",
      qualificationStatus: failures.length ? "fail" : missing.length ? "insufficient-evidence" : "pass",
      stability: runs.length ? runs.filter((r) => r.stability).length / runs.length : null,
      quality, reasons: [...failures, ...missing], runs });
  }
  const passing = results.filter((r) => r.qualificationStatus === "pass").sort((a, b) =>
    (b.quality?.metrics.recall ?? 0) - (a.quality?.metrics.recall ?? 0)
    || (b.quality?.metrics.precision ?? 0) - (a.quality?.metrics.precision ?? 0)
    || a.candidateId.localeCompare(b.candidateId));
  return { schemaVersion: 1, policyVersion: input.policy.policyVersion, candidates: results, recommendation: passing[0]?.candidateId ?? null, hardResourceIsolation: false };
}
