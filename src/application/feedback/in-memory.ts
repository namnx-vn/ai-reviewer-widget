import type { DeveloperFeedbackQuery, DeveloperFeedbackRecord } from "./contracts";
import type { DeveloperFeedbackPersistencePort } from "./ports";

export function createInMemoryDeveloperFeedbackPersistence(
  initial: readonly DeveloperFeedbackRecord[] = [],
): DeveloperFeedbackPersistencePort {
  const records = new Map(initial.map((record) => [record.feedbackId, structuredClone(record)]));

  return {
    async create(record) {
      if (records.has(record.feedbackId)) {
        throw new Error(`Developer feedback already exists: ${record.feedbackId}`);
      }
      records.set(record.feedbackId, structuredClone(record));
    },

    async getById(feedbackId) {
      const record = records.get(feedbackId);
      return record === undefined ? undefined : structuredClone(record);
    },

    async list(query) {
      const limit = query.limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, query.limit);
      return [...records.values()]
        .filter((record) => matches(record, query))
        .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
        .slice(0, limit)
        .map((record) => structuredClone(record));
    },
  };
}

function matches(record: DeveloperFeedbackRecord, query: DeveloperFeedbackQuery): boolean {
  if (query.reviewRunId !== undefined && record.reviewRunId !== query.reviewRunId) return false;
  if (query.repositoryId !== undefined && record.repository.repositoryId !== query.repositoryId) return false;
  if (query.owner !== undefined && record.repository.owner !== query.owner) return false;
  if (query.name !== undefined && record.repository.name !== query.name) return false;
  if (query.ruleId !== undefined && record.ruleId !== query.ruleId) return false;
  if (query.action !== undefined && record.action !== query.action) return false;
  return true;
}
