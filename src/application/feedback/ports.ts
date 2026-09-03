import type { DeveloperFeedbackQuery, DeveloperFeedbackRecord } from "./contracts";

export interface DeveloperFeedbackPersistencePort {
  create(record: DeveloperFeedbackRecord): Promise<void>;
  getById(feedbackId: string): Promise<DeveloperFeedbackRecord | undefined>;
  list(query: DeveloperFeedbackQuery): Promise<readonly DeveloperFeedbackRecord[]>;
}
