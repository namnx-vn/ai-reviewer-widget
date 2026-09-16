import {
  buildRepositoryContext,
  calculateIncrementalAnalysisScope,
  prepareAnalyzerFiles,
  type AnalyzerFileChange,
  type IncrementalAnalysisScope,
} from "../analyzer";
import type { AIReviewerPort, ReviewUseCases, SourceFile } from "../application/review";
import type { ReviewFinding, ReviewResult, Severity } from "../domain/review";
import type { ExpectedFinding, FindingMatchResult } from "./contracts";
import { matchFindings } from "./matcher";

/** A caller-supplied offline capture. The manifest must include every in-scope source/context path. */
export interface RepositorySnapshot {
  readonly repositoryId: string;
  readonly snapshotId: string;
  readonly files: readonly SourceFile[];
  readonly expectedPaths: readonly string[];
  readonly unsupportedPaths?: readonly string[];
  readonly expectedFindings: readonly ExpectedFinding[];
  readonly contextBudget?: { readonly maxFiles: number; readonly maxCharacters: number };
}

export interface RepositoryCompletenessIssue {
  readonly code: string;
  readonly reference: string;
}

export interface RepositoryCompleteness {
  readonly status: "complete" | "incomplete";
  readonly issues: readonly RepositoryCompletenessIssue[];
  readonly manifestFileCount: number;
  readonly capturedFileCount: number;
  readonly analyzedFileCount: number;
}

export interface RepositoryReviewEvaluation {
  readonly schemaVersion: 1;
  readonly fidelity: "offline-repository-snapshot";
  readonly repositoryId: string;
  readonly snapshotId: string;
  readonly mode: "deterministic" | "deterministic-and-injected-ai";
  readonly completeness: RepositoryCompleteness;
  readonly result: ReviewResult;
  readonly matchResult: FindingMatchResult;
  readonly status: "passed" | "failed" | "incomplete";
}

export interface PullRequestEvaluationInput {
  readonly id: string;
  readonly title: string;
  readonly base: RepositorySnapshot;
  readonly head: RepositorySnapshot;
  /** Exact adapter changes/ranges when available; otherwise full-file replacement ranges are derived. */
  readonly changes?: readonly AnalyzerFileChange[];
  readonly expectedIntroducedFindings: readonly ExpectedFinding[];
}

export interface PullRequestReviewEvaluation {
  readonly schemaVersion: 1;
  readonly fidelity: "offline-base-head-pr";
  readonly id: string;
  readonly base: RepositoryReviewEvaluation;
  readonly head: RepositoryReviewEvaluation;
  readonly incremental: ReviewResult;
  readonly incrementalScope: IncrementalAnalysisScope;
  readonly introduced: readonly ReviewFinding[];
  readonly baseline: readonly ReviewFinding[];
  readonly worsened: readonly { readonly before: ReviewFinding; readonly after: ReviewFinding }[];
  readonly resolved: readonly ReviewFinding[];
  /** Full-head affected-file findings absent from incremental analysis. */
  readonly missingIncrementalFindings: readonly ReviewFinding[];
  readonly unexpectedIncrementalFindings: readonly ReviewFinding[];
  readonly parity: boolean;
  readonly completeness: RepositoryCompleteness;
  readonly matchResult: FindingMatchResult;
  readonly status: "passed" | "failed" | "incomplete";
}

const SEVERITY: Readonly<Record<Severity, number>> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const UNSUPPORTED_SOURCE = /\.(?:py|go|rs|java|kt|kts|rb|php|c|cc|cpp|h|cs|swift|vue|svelte)$/;

function validateSnapshot(snapshot: RepositorySnapshot): void {
  if (!snapshot.repositoryId.trim() || !snapshot.snapshotId.trim()) throw new Error("Repository and snapshot identities are required.");
  const paths = snapshot.files.map(({ path }) => path);
  for (const list of [paths, snapshot.expectedPaths]) {
    if (new Set(list).size !== list.length) throw new Error("Snapshot paths must be unique.");
    if (list.some((path) => !path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === ".." || part === "."))) {
      throw new Error("Snapshot paths must be normalized repository-relative paths.");
    }
  }
  if (paths.some((path) => !snapshot.expectedPaths.includes(path))) throw new Error("Captured files must be represented in the manifest.");
  if (snapshot.contextBudget !== undefined && Object.values(snapshot.contextBudget).some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Context budgets must be nonnegative integers.");
  }
}

function boundedFiles(snapshot: RepositorySnapshot): readonly SourceFile[] {
  let characters = 0;
  return [...snapshot.files].sort((a, b) => a.path.localeCompare(b.path)).filter((file, index) => {
    characters += file.content.length;
    return snapshot.contextBudget === undefined || (index < snapshot.contextBudget.maxFiles && characters <= snapshot.contextBudget.maxCharacters);
  });
}

function completeness(
  snapshot: RepositorySnapshot,
  files: readonly SourceFile[],
  result: ReviewResult,
): RepositoryCompleteness {
  const issues: RepositoryCompletenessIssue[] = snapshot.expectedPaths
    .filter((path) => !snapshot.files.some((file) => file.path === path))
    .map((reference) => ({ code: "MISSING_FILE", reference }));
  if (files.length !== snapshot.files.length) issues.push({ code: "CONTEXT_BUDGET_EXCEEDED", reference: snapshot.snapshotId });
  const unsupported = new Set([
    ...(snapshot.unsupportedPaths ?? []),
    ...snapshot.expectedPaths.filter((path) => UNSUPPORTED_SOURCE.test(path)),
  ]);
  issues.push(...[...unsupported].map((reference) => ({ code: "UNSUPPORTED_SOURCE", reference })));
  const context = buildRepositoryContext(files);
  issues.push(...context.imports
    .filter(({ specifier, resolvedPath }) => specifier.startsWith(".") && resolvedPath === undefined)
    .map(({ from, specifier }) => ({ code: "UNRESOLVED_LOCAL_IMPORT", reference: `${from}:${specifier}` })));
  issues.push(...context.exports
    .filter(({ sourceSpecifier, resolvedPath }) => sourceSpecifier?.startsWith(".") && resolvedPath === undefined)
    .map(({ from, sourceSpecifier }) => ({ code: "UNRESOLVED_LOCAL_IMPORT", reference: `${from}:${sourceSpecifier}` })));
  // A successful fallback or analyzer failure is still an incomplete run of the requested pipeline.
  issues.push(...result.warnings.filter(({ code }) => code !== "AI_INPUT_REDACTED")
    .map(({ code, message }) => ({ code, reference: message })));
  return {
    status: issues.length === 0 ? "complete" : "incomplete", issues,
    manifestFileCount: snapshot.expectedPaths.length,
    capturedFileCount: snapshot.files.length,
    analyzedFileCount: prepareAnalyzerFiles(files).sourceFiles.length,
  };
}

function fullPatch(content: string, previous = ""): string {
  const before = previous === "" ? [] : previous.split("\n");
  const after = content === "" ? [] : content.split("\n");
  return [`@@ -1,${before.length} +1,${after.length} @@`, ...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)].join("\n");
}

async function reviewSnapshot(
  useCases: ReviewUseCases,
  snapshot: RepositorySnapshot,
  title: string,
  aiReviewer?: AIReviewerPort,
  previousFiles: readonly SourceFile[] = [],
  incrementalScope?: IncrementalAnalysisScope,
  changedPaths?: readonly string[],
): Promise<RepositoryReviewEvaluation> {
  validateSnapshot(snapshot);
  const files = boundedFiles(snapshot);
  const previous = new Map(previousFiles.map((file) => [file.path, file.content]));
  const reviewed = files.map((file) => ({ ...file,
    patch: changedPaths !== undefined && !changedPaths.includes(file.path)
      ? undefined : fullPatch(file.content, previous.get(file.path)),
  }));
  let aiCalls = 0;
  const measuredAI: AIReviewerPort | undefined = aiReviewer === undefined ? undefined : {
    name: aiReviewer.name,
    review: async (request) => { aiCalls += 1; return aiReviewer.review(request); },
  };
  const result = await useCases.reviewPullRequest({ title, files: reviewed, baseFiles: previousFiles, incrementalScope }, measuredAI);
  const measuredResult = aiReviewer !== undefined && aiCalls === 0 ? {
    ...result, warnings: [...result.warnings, { code: "AI_INPUT_OMITTED" as const, message: "Requested AI evaluation did not execute." }],
  } : result;
  const coverage = completeness(snapshot, files, measuredResult);
  const matchResult = matchFindings(snapshot.expectedFindings, result.findings);
  return {
    schemaVersion: 1, fidelity: "offline-repository-snapshot",
    repositoryId: snapshot.repositoryId, snapshotId: snapshot.snapshotId,
    mode: aiReviewer === undefined ? "deterministic" : "deterministic-and-injected-ai",
    completeness: coverage, result: measuredResult, matchResult,
    status: coverage.status === "incomplete" ? "incomplete"
      : matchResult.falseNegatives.length > 0 || matchResult.falsePositives.length > 0 ? "failed" : "passed",
  };
}

export function evaluateRepositoryReview(
  useCases: ReviewUseCases,
  snapshot: RepositorySnapshot,
  aiReviewer?: AIReviewerPort,
): Promise<RepositoryReviewEvaluation> {
  return reviewSnapshot(useCases, snapshot, `Offline repository ${snapshot.snapshotId}`, aiReviewer);
}

function deriveChanges(base: RepositorySnapshot, head: RepositorySnapshot): readonly AnalyzerFileChange[] {
  const before = new Map(base.files.map((file) => [file.path, file.content]));
  const after = new Map(head.files.map((file) => [file.path, file.content]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((path): AnalyzerFileChange[] => {
    if (before.get(path) === after.get(path)) return [];
    const content = after.get(path);
    return [{ path, status: content === undefined ? "deleted" : before.has(path) ? "modified" : "added",
      ranges: content === undefined ? [] : [{ startLine: 1, endLine: content.split("\n").length }],
    }];
  });
}

function validateChanges(changes: readonly AnalyzerFileChange[], base: RepositorySnapshot, head: RepositorySnapshot): void {
  const covered = new Set(changes.flatMap(({ path, previousPath }) => previousPath === undefined ? [path] : [path, previousPath]));
  if (deriveChanges(base, head).some(({ path }) => !covered.has(path))) throw new Error("PR changes omit a base/head content difference.");
  if (new Set(changes.map(({ path }) => path)).size !== changes.length) throw new Error("PR changed paths must be unique.");
  for (const change of changes) {
    const path = change.path;
    const prior = change.previousPath ?? path;
    if ([path, prior].some((value) => !value || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === "." || part === ".."))) throw new Error("Changed paths must be normalized repository-relative paths.");
    const inBase = base.files.some((file) => file.path === prior);
    const inHead = head.files.some((file) => file.path === path);
    if ((change.status === "added" && (inBase || !inHead)) || (change.status === "deleted" && (!inBase || inHead))
      || (change.status === "modified" && (!inBase || !inHead)) || (change.status === "renamed" && (!inBase || !inHead || change.previousPath === undefined))) {
      throw new Error("Changed-file status does not match the base/head capture.");
    }
    if (change.ranges?.some(({ startLine, endLine }) => !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine)) throw new Error("Invalid changed range.");
  }
}

/** Compare detector/file/claim identity rather than raw IDs containing shifted line numbers. */
function claimKey(finding: ReviewFinding): string {
  return JSON.stringify([finding.ruleId, finding.source, finding.location?.file, finding.title, finding.message]);
}

function compareDebt(before: readonly ReviewFinding[], after: readonly ReviewFinding[]) {
  const unmatched = new Set(before.map((_, index) => index));
  const introduced: ReviewFinding[] = [];
  const baseline: ReviewFinding[] = [];
  const worsened: { before: ReviewFinding; after: ReviewFinding }[] = [];
  for (const finding of after) {
    const index = before.findIndex((item, index) => unmatched.has(index) && claimKey(item) === claimKey(finding));
    if (index < 0) introduced.push(finding);
    else {
      unmatched.delete(index);
      if (SEVERITY[finding.severity] > SEVERITY[before[index].severity]) worsened.push({ before: before[index], after: finding });
      else baseline.push(finding);
    }
  }
  return { introduced, baseline, worsened, resolved: before.filter((_, index) => unmatched.has(index)) };
}

function parityKey(finding: ReviewFinding): string {
  return JSON.stringify([claimKey(finding), finding.location?.line, finding.location?.column, finding.severity, finding.message, finding.confidence]);
}

function missingFindings(expected: readonly ReviewFinding[], actual: readonly ReviewFinding[]): readonly ReviewFinding[] {
  const remaining = actual.map(parityKey);
  return expected.filter((finding) => {
    const index = remaining.indexOf(parityKey(finding));
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
}

export async function evaluatePullRequestReview(
  useCases: ReviewUseCases,
  input: PullRequestEvaluationInput,
  aiReviewer?: AIReviewerPort,
): Promise<PullRequestReviewEvaluation> {
  if (input.base.repositoryId !== input.head.repositoryId) throw new Error("PR base and head must belong to one repository.");
  validateSnapshot(input.base);
  validateSnapshot(input.head);
  const changes = input.changes ?? deriveChanges(input.base, input.head);
  validateChanges(changes, input.base, input.head);
  const changedPaths = changes.filter(({ status }) => status !== "deleted").map(({ path }) => path);
  const incrementalScope = calculateIncrementalAnalysisScope(changes, buildRepositoryContext(boundedFiles(input.head)));
  const base = await reviewSnapshot(useCases, input.base, `${input.title} (base)`, aiReviewer);
  const head = await reviewSnapshot(useCases, input.head, input.title, aiReviewer, input.base.files, undefined, changedPaths);
  const incrementalReport = await reviewSnapshot(useCases, input.head, input.title, aiReviewer, input.base.files, incrementalScope, changedPaths);
  const debt = compareDebt(base.result.findings, head.result.findings);
  const affected = head.result.findings.filter((finding) => finding.location === undefined || incrementalScope.impactedFiles.includes(finding.location.file) || debt.introduced.includes(finding) || debt.worsened.some(({ after }) => after === finding));
  const missingIncrementalFindings = missingFindings(affected, incrementalReport.result.findings);
  const unexpectedIncrementalFindings = missingFindings(incrementalReport.result.findings, head.result.findings);
  const parity = missingIncrementalFindings.length === 0 && unexpectedIncrementalFindings.length === 0;
  const issues = [...base.completeness.issues, ...head.completeness.issues, ...incrementalReport.completeness.issues];
  const coverage: RepositoryCompleteness = { ...head.completeness, issues, status: issues.length === 0 ? "complete" : "incomplete" };
  const matchResult = matchFindings(input.expectedIntroducedFindings, [...debt.introduced, ...debt.worsened.map(({ after }) => after)]);
  return {
    schemaVersion: 1, fidelity: "offline-base-head-pr", id: input.id, base, head,
    incremental: incrementalReport.result, incrementalScope, ...debt,
    missingIncrementalFindings, unexpectedIncrementalFindings, parity, completeness: coverage, matchResult,
    status: coverage.status === "incomplete" ? "incomplete" : !parity || matchResult.falseNegatives.length > 0 || matchResult.falsePositives.length > 0 ? "failed" : "passed",
  };
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a manifest object.");
  const item: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  if (Object.keys(item).some((key) => !keys.includes(key))) throw new Error("Unknown manifest field.");
  return item;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a manifest string.");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected a finite manifest number.");
  return value;
}
function array<T>(value: unknown, parse: (value: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error("Expected a manifest array.");
  return value.map((item: unknown) => parse(item));
}
function parseExpectedFinding(value: unknown): ExpectedFinding {
  const item = record(value, ["id", "ruleId", "severity", "file", "line"]);
  const severity = string(item.severity);
  if (severity !== "critical" && severity !== "high" && severity !== "medium" && severity !== "low" && severity !== "info") throw new Error("Invalid expected severity.");
  const line = item.line === undefined ? undefined : number(item.line);
  if (line !== undefined && (!Number.isInteger(line) || line < 1)) throw new Error("Expected lines must be positive integers.");
  return { id: string(item.id), ruleId: string(item.ruleId), severity, file: item.file === undefined ? undefined : string(item.file), line };
}
function parseSourceFile(value: unknown): SourceFile {
  const item = record(value, ["path", "content", "patch", "changedLines"]);
  const changedLines = item.changedLines === undefined ? undefined : array(item.changedLines, number);
  if (changedLines?.some((line) => !Number.isInteger(line) || line < 1)) throw new Error("Changed lines must be positive integers.");
  return { path: string(item.path), content: string(item.content), patch: item.patch === undefined ? undefined : string(item.patch), changedLines };
}

/** Strict JSON entry point for local operator manifests; retains no source outside the review invocation. */
export function parseRepositoryReviewInput(value: unknown): RepositorySnapshot {
  const item = record(value, ["repositoryId", "snapshotId", "files", "expectedPaths", "unsupportedPaths", "expectedFindings", "contextBudget"]);
  const budget = item.contextBudget === undefined ? undefined : record(item.contextBudget, ["maxFiles", "maxCharacters"]);
  const snapshot: RepositorySnapshot = {
    repositoryId: string(item.repositoryId), snapshotId: string(item.snapshotId),
    files: array(item.files, parseSourceFile), expectedPaths: array(item.expectedPaths, string),
    unsupportedPaths: item.unsupportedPaths === undefined ? undefined : array(item.unsupportedPaths, string),
    expectedFindings: array(item.expectedFindings, parseExpectedFinding),
    contextBudget: budget === undefined ? undefined : { maxFiles: number(budget.maxFiles), maxCharacters: number(budget.maxCharacters) },
  };
  validateSnapshot(snapshot);
  return snapshot;
}
function parseChange(value: unknown): AnalyzerFileChange {
  const item = record(value, ["path", "status", "previousPath", "ranges"]);
  const status = string(item.status);
  if (status !== "added" && status !== "modified" && status !== "deleted" && status !== "renamed") throw new Error("Invalid change status.");
  const ranges = item.ranges === undefined ? undefined : array(item.ranges, (value) => {
    const range = record(value, ["startLine", "endLine"]);
    const startLine = number(range.startLine), endLine = number(range.endLine);
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) throw new Error("Invalid changed range.");
    return { startLine, endLine };
  });
  return { path: string(item.path), status, previousPath: item.previousPath === undefined ? undefined : string(item.previousPath), ranges };
}
export function parsePullRequestReviewInput(value: unknown): PullRequestEvaluationInput {
  const item = record(value, ["id", "title", "base", "head", "changes", "expectedIntroducedFindings"]);
  const input: PullRequestEvaluationInput = {
    id: string(item.id), title: string(item.title), base: parseRepositoryReviewInput(item.base), head: parseRepositoryReviewInput(item.head),
    changes: item.changes === undefined ? undefined : array(item.changes, parseChange),
    expectedIntroducedFindings: array(item.expectedIntroducedFindings, parseExpectedFinding),
  };
  if (!input.id.trim() || !input.title.trim()) throw new Error("PR identity and title are required.");
  if (input.base.repositoryId !== input.head.repositoryId) throw new Error("PR base and head must belong to one repository.");
  if (input.changes !== undefined) validateChanges(input.changes, input.base, input.head);
  return input;
}
