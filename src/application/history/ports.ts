import type { ReviewHistoryQuery, ReviewRunSnapshot } from "./contracts";

export interface ReviewRunPersistencePort {
  create(snapshot: ReviewRunSnapshot): Promise<void>;
  update(snapshot: ReviewRunSnapshot): Promise<void>;
  getById(runId: string): Promise<ReviewRunSnapshot | undefined>;
  list(query: ReviewHistoryQuery): Promise<readonly ReviewRunSnapshot[]>;
}
