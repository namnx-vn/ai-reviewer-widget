export const DEVELOPER_FEEDBACK_SCHEMA_VERSION = 1 as const;

export type DeveloperFeedbackSchemaVersion = typeof DEVELOPER_FEEDBACK_SCHEMA_VERSION;

export type DeveloperFeedbackAction =
  | "accepted"
  | "fixed"
  | "false-positive"
  | "ignored"
  | "accepted-risk"
  | "duplicate"
  | "not-actionable";

export type DeveloperFeedbackFindingState = "current" | "historical" | "deleted";

export interface DeveloperFeedbackRepositoryIdentity {
  readonly repositoryId?: string;
  readonly owner?: string;
  readonly name?: string;
}

export interface DeveloperFeedbackRecordV1 {
  readonly version: DeveloperFeedbackSchemaVersion;
  readonly feedbackId: string;
  readonly reviewRunId: string;
  readonly repository: DeveloperFeedbackRepositoryIdentity;
  readonly findingFingerprint: string;
  readonly ruleId: string;
  readonly findingState: DeveloperFeedbackFindingState;
  readonly action: DeveloperFeedbackAction;
  readonly reason?: string;
  readonly recordedAt: string;
}

export type DeveloperFeedbackRecord = DeveloperFeedbackRecordV1;

export interface DeveloperFeedbackInput {
  readonly feedbackId: string;
  readonly reviewRunId: string;
  readonly repository: DeveloperFeedbackRepositoryIdentity;
  readonly findingFingerprint: string;
  readonly ruleId: string;
  readonly findingState: DeveloperFeedbackFindingState;
  readonly action: DeveloperFeedbackAction;
  readonly reason?: string;
  readonly recordedAt: string;
}

export interface DeveloperFeedbackQuery {
  readonly reviewRunId?: string;
  readonly repositoryId?: string;
  readonly owner?: string;
  readonly name?: string;
  readonly ruleId?: string;
  readonly action?: DeveloperFeedbackAction;
  readonly limit?: number;
}

export interface DeveloperFeedbackMetricsV1 {
  readonly version: 1;
  readonly total: number;
  readonly byAction: Readonly<Record<DeveloperFeedbackAction, number>>;
  readonly falsePositiveRate: number;
  readonly actionableRate: number;
}

export interface FalsePositiveEvaluationExportV1 {
  readonly version: 1;
  readonly feedbackId: string;
  readonly reviewRunId: string;
  readonly repository: DeveloperFeedbackRepositoryIdentity;
  readonly findingFingerprint: string;
  readonly ruleId: string;
  readonly findingState: DeveloperFeedbackFindingState;
  readonly reason?: string;
  readonly recordedAt: string;
}
