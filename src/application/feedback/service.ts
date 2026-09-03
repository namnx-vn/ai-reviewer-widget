import { fingerprintReviewFinding, type ReviewFinding } from "../../domain/review";
import type { ReviewRunPersistencePort, ReviewRunSnapshot } from "../history";
import type {
  DeveloperFeedbackAction,
  DeveloperFeedbackInput,
  DeveloperFeedbackMetricsV1,
  DeveloperFeedbackQuery,
  DeveloperFeedbackRecord,
  FalsePositiveEvaluationExportV1,
} from "./contracts";
import { DEVELOPER_FEEDBACK_SCHEMA_VERSION } from "./contracts";
import type { DeveloperFeedbackPersistencePort } from "./ports";

export interface DeveloperFeedbackService {
  record(input: DeveloperFeedbackInput): Promise<DeveloperFeedbackRecord>;
  list(query?: DeveloperFeedbackQuery): Promise<readonly DeveloperFeedbackRecord[]>;
  metrics(query?: DeveloperFeedbackQuery): Promise<DeveloperFeedbackMetricsV1>;
  exportFalsePositives(query?: Omit<DeveloperFeedbackQuery, "action">): Promise<readonly FalsePositiveEvaluationExportV1[]>;
}

export interface DeveloperFeedbackDependencies {
  readonly feedback: DeveloperFeedbackPersistencePort;
  readonly history: ReviewRunPersistencePort;
}

export class InvalidDeveloperFeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDeveloperFeedbackError";
  }
}

export function createDeveloperFeedbackService(
  dependencies: DeveloperFeedbackDependencies,
): DeveloperFeedbackService {
  return {
    async record(input) {
      validateInput(input);
      const run = await dependencies.history.getById(input.reviewRunId);
      if (run === undefined) {
        throw new InvalidDeveloperFeedbackError(`Unknown review run: ${input.reviewRunId}`);
      }
      assertRepositoryMatches(input, run);
      assertFindingReference(input, run);

      const record: DeveloperFeedbackRecord = {
        version: DEVELOPER_FEEDBACK_SCHEMA_VERSION,
        feedbackId: input.feedbackId.trim(),
        reviewRunId: input.reviewRunId.trim(),
        repository: { ...input.repository },
        findingFingerprint: input.findingFingerprint.trim(),
        ruleId: input.ruleId.trim(),
        findingState: input.findingState,
        action: input.action,
        reason: normalizeOptionalText(input.reason),
        recordedAt: input.recordedAt,
      };
      await dependencies.feedback.create(record);
      return structuredClone(record);
    },

    async list(query = {}) {
      return dependencies.feedback.list(query);
    },

    async metrics(query = {}) {
      return summarizeFeedback(await dependencies.feedback.list(query));
    },

    async exportFalsePositives(query = {}) {
      const records = await dependencies.feedback.list({ ...query, action: "false-positive" });
      return records.map((record): FalsePositiveEvaluationExportV1 => ({
        version: 1,
        feedbackId: record.feedbackId,
        reviewRunId: record.reviewRunId,
        repository: { ...record.repository },
        findingFingerprint: record.findingFingerprint,
        ruleId: record.ruleId,
        findingState: record.findingState,
        reason: record.reason,
        recordedAt: record.recordedAt,
      }));
    },
  };
}

export function summarizeFeedback(
  records: readonly DeveloperFeedbackRecord[],
): DeveloperFeedbackMetricsV1 {
  const byAction = emptyActionCounts();
  for (const record of records) byAction[record.action] += 1;
  const total = records.length;
  const actionable = byAction.accepted + byAction.fixed + byAction["accepted-risk"];
  return {
    version: 1,
    total,
    byAction,
    falsePositiveRate: total === 0 ? 0 : byAction["false-positive"] / total,
    actionableRate: total === 0 ? 0 : actionable / total,
  };
}

function validateInput(input: DeveloperFeedbackInput): void {
  if (input.feedbackId.trim().length === 0) throw new InvalidDeveloperFeedbackError("Feedback ID is required.");
  if (input.reviewRunId.trim().length === 0) throw new InvalidDeveloperFeedbackError("Review run ID is required.");
  if (input.findingFingerprint.trim().length === 0) throw new InvalidDeveloperFeedbackError("Finding fingerprint is required.");
  if (input.ruleId.trim().length === 0) throw new InvalidDeveloperFeedbackError("Rule ID is required.");
  if (Number.isNaN(Date.parse(input.recordedAt))) throw new InvalidDeveloperFeedbackError("Feedback timestamp must be a valid ISO date.");
}

function assertRepositoryMatches(input: DeveloperFeedbackInput, run: ReviewRunSnapshot): void {
  const repository = run.repository;
  if (input.repository.repositoryId !== undefined && input.repository.repositoryId !== repository?.id) {
    throw new InvalidDeveloperFeedbackError("Feedback repository ID does not match the review run.");
  }
  if (input.repository.owner !== undefined && input.repository.owner !== repository?.owner) {
    throw new InvalidDeveloperFeedbackError("Feedback repository owner does not match the review run.");
  }
  if (input.repository.name !== undefined && input.repository.name !== repository?.name) {
    throw new InvalidDeveloperFeedbackError("Feedback repository name does not match the review run.");
  }
}

function assertFindingReference(input: DeveloperFeedbackInput, run: ReviewRunSnapshot): void {
  const findings = run.result?.findings ?? [];
  const matched = findings.find((finding) => {
    if (finding.ruleId !== input.ruleId.trim()) return false;
    return fingerprintReviewFinding(toReviewFinding(finding)) === input.findingFingerprint.trim();
  });
  if (matched === undefined) {
    throw new InvalidDeveloperFeedbackError(
      `Finding fingerprint is not present in review run ${input.reviewRunId}.`,
    );
  }
}

function toReviewFinding(
  finding: NonNullable<ReviewRunSnapshot["result"]>["findings"][number],
): ReviewFinding {
  return {
    id: finding.identity,
    ruleId: finding.ruleId,
    title: finding.title,
    message: finding.message,
    severity: finding.severity,
    source: finding.source,
    confidence: finding.confidence,
    location: finding.location === undefined ? undefined : { ...finding.location },
    suggestion: finding.suggestion,
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function emptyActionCounts(): Record<DeveloperFeedbackAction, number> {
  return {
    accepted: 0,
    fixed: 0,
    "false-positive": 0,
    ignored: 0,
    "accepted-risk": 0,
    duplicate: 0,
    "not-actionable": 0,
  };
}
