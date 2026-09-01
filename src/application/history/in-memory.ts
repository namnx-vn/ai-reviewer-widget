import type { ReviewHistoryQuery, ReviewRunSnapshot } from "./contracts";
import type { ReviewRunPersistencePort } from "./ports";

export function createInMemoryReviewRunPersistence(
  initial: readonly ReviewRunSnapshot[] = [],
): ReviewRunPersistencePort {
  const runs = new Map(initial.map((snapshot) => [snapshot.runId, clone(snapshot)]));

  return {
    async create(snapshot) {
      if (runs.has(snapshot.runId)) {
        throw new Error(`Review run already exists: ${snapshot.runId}`);
      }
      runs.set(snapshot.runId, clone(snapshot));
    },

    async update(snapshot) {
      if (!runs.has(snapshot.runId)) {
        throw new Error(`Review run does not exist: ${snapshot.runId}`);
      }
      runs.set(snapshot.runId, clone(snapshot));
    },

    async getById(runId) {
      const snapshot = runs.get(runId);
      return snapshot === undefined ? undefined : clone(snapshot);
    },

    async list(query) {
      const limit = query.limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, query.limit);
      return [...runs.values()]
        .filter((snapshot) => matchesRepository(snapshot, query))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .slice(0, limit)
        .map(clone);
    },
  };
}

function matchesRepository(snapshot: ReviewRunSnapshot, query: ReviewHistoryQuery): boolean {
  if (query.repositoryId !== undefined && snapshot.repository?.id !== query.repositoryId) return false;
  if (query.owner !== undefined && snapshot.repository?.owner !== query.owner) return false;
  if (query.name !== undefined && snapshot.repository?.name !== query.name) return false;
  return true;
}

function clone(snapshot: ReviewRunSnapshot): ReviewRunSnapshot {
  return structuredClone(snapshot);
}
