import type { ReviewResult } from "../../domain/review";
import type { ReviewHistoryQuery, ReviewRunSnapshot } from "./contracts";
import type { ReviewRunPersistencePort } from "./ports";
import {
  completeReviewRunSnapshot,
  createStartedReviewRunSnapshot,
  failReviewRunSnapshot,
  type ReviewRunSnapshotInput,
} from "./snapshot";

export class ReviewHistoryPersistenceError extends Error {
  constructor(
    readonly operation: "create" | "update" | "get" | "list",
    message: string,
    readonly completedResult?: ReviewResult,
  ) {
    super(message);
    this.name = "ReviewHistoryPersistenceError";
  }
}

export interface ReviewHistoryService {
  start(input: ReviewRunSnapshotInput): Promise<ReviewRunSnapshot>;
  complete(started: ReviewRunSnapshot, result: ReviewResult, completedAt: string): Promise<ReviewRunSnapshot>;
  fail(
    started: ReviewRunSnapshot,
    failure: { readonly code: string; readonly message: string },
    completedAt: string,
  ): Promise<ReviewRunSnapshot>;
  getById(runId: string): Promise<ReviewRunSnapshot | undefined>;
  list(query: ReviewHistoryQuery): Promise<readonly ReviewRunSnapshot[]>;
}

export function createReviewHistoryService(
  persistence: ReviewRunPersistencePort,
): ReviewHistoryService {
  return {
    async start(input) {
      const snapshot = createStartedReviewRunSnapshot(input);
      try {
        await persistence.create(snapshot);
      } catch (error) {
        throw persistenceError("create", error);
      }
      return snapshot;
    },

    async complete(started, result, completedAt) {
      const snapshot = completeReviewRunSnapshot(started, result, completedAt);
      try {
        await persistence.update(snapshot);
      } catch (error) {
        throw persistenceError("update", error, result);
      }
      return snapshot;
    },

    async fail(started, failure, completedAt) {
      const snapshot = failReviewRunSnapshot(started, failure, completedAt);
      try {
        await persistence.update(snapshot);
      } catch (error) {
        throw persistenceError("update", error);
      }
      return snapshot;
    },

    async getById(runId) {
      try {
        return await persistence.getById(runId);
      } catch (error) {
        throw persistenceError("get", error);
      }
    },

    async list(query) {
      try {
        return await persistence.list(query);
      } catch (error) {
        throw persistenceError("list", error);
      }
    },
  };
}

function persistenceError(
  operation: ReviewHistoryPersistenceError["operation"],
  error: unknown,
  completedResult?: ReviewResult,
): ReviewHistoryPersistenceError {
  const detail = error instanceof Error ? error.message : "Unknown persistence failure.";
  return new ReviewHistoryPersistenceError(
    operation,
    `Review history persistence ${operation} failed: ${detail}`,
    completedResult,
  );
}
