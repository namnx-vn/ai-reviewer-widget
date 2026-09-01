import { describe, expect, it, vi } from "vitest";

import { DEFAULT_REVIEW_CONFIGURATION } from "../../../config";
import type { ReviewFinding, ReviewResult } from "../../../domain/review";
import {
  REVIEW_RUN_SCHEMA_VERSION,
  compareFindingHistory,
  createFindingIdentity,
  createInMemoryReviewRunPersistence,
  createReviewHistoryService,
  ReviewHistoryPersistenceError,
  toPersistedFinding,
  type ReviewRunPersistencePort,
} from "..";

const finding: ReviewFinding = {
  id: "finding-1",
  ruleId: "quality.example",
  title: "Example finding",
  message: "Example message",
  severity: "medium",
  source: "ast",
  confidence: 1,
  location: { file: "src/example.ts", line: 4, column: 2 },
  suggestion: "Fix it",
};

const result: ReviewResult = {
  score: 90,
  decision: "WARN",
  findings: [finding],
  stats: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
  warnings: [],
  durationMs: 12,
};

describe("review history persistence", () => {
  it("stores a versioned run lifecycle without retaining source content", async () => {
    const persistence = createInMemoryReviewRunPersistence();
    const service = createReviewHistoryService(persistence);

    const started = await service.start({
      runId: "run-1",
      repository: { id: "repo-1", owner: "acme", name: "reviewer", ref: "main" },
      source: { reference: "source-1", ref: "main", commitSha: "abc123" },
      configuration: DEFAULT_REVIEW_CONFIGURATION,
      execution: { mode: "files", aiProvider: "test-ai" },
      startedAt: "2026-09-01T10:00:00.000Z",
    });
    const completed = await service.complete(started, result, "2026-09-01T10:00:01.000Z");
    const stored = await service.getById("run-1");

    expect(completed.schemaVersion).toBe(REVIEW_RUN_SCHEMA_VERSION);
    expect(stored).toEqual(completed);
    expect(JSON.stringify(stored)).not.toContain("const secret");
    expect(stored?.result?.findings[0]).toMatchObject({
      identity: createFindingIdentity(finding),
      ruleId: finding.ruleId,
      location: finding.location,
    });
  });

  it("returns isolated snapshots and repository-scoped history in newest-first order", async () => {
    const persistence = createInMemoryReviewRunPersistence();
    const service = createReviewHistoryService(persistence);

    const first = await service.start(runInput("run-1", "2026-09-01T10:00:00.000Z", "repo-1"));
    await service.complete(first, result, "2026-09-01T10:00:01.000Z");
    const second = await service.start(runInput("run-2", "2026-09-01T11:00:00.000Z", "repo-1"));
    await service.complete(second, result, "2026-09-01T11:00:01.000Z");
    const other = await service.start(runInput("run-3", "2026-09-01T12:00:00.000Z", "repo-2"));
    await service.complete(other, result, "2026-09-01T12:00:01.000Z");

    const history = await service.list({ repositoryId: "repo-1", limit: 1 });
    expect(history.map((run) => run.runId)).toEqual(["run-2"]);

    const fetched = await service.getById("run-2");
    if (fetched?.result !== undefined) {
      (fetched.result.findings as { title: string }[])[0].title = "mutated";
    }
    expect((await service.getById("run-2"))?.result?.findings[0].title).toBe("Example finding");
  });

  it("classifies historical findings with an explicit deterministic identity policy", () => {
    const existing = toPersistedFinding(finding);
    const currentOnly = toPersistedFinding({
      ...finding,
      id: "finding-2",
      ruleId: "quality.current",
      title: "Current only",
    });
    const previousOnly = toPersistedFinding({
      ...finding,
      id: "finding-3",
      ruleId: "quality.previous",
      title: "Previous only",
    });

    expect(compareFindingHistory(
      [existing, currentOnly],
      [existing, previousOnly],
    ).map(({ state, identity }) => ({ state, identity }))).toEqual([
      { state: "existing", identity: existing.identity },
      { state: "new", identity: currentOnly.identity },
      { state: "resolved", identity: previousOnly.identity },
    ]);
  });

  it("stores an explicit terminal failure snapshot", async () => {
    const service = createReviewHistoryService(createInMemoryReviewRunPersistence());
    const started = await service.start(runInput("run-failed", "2026-09-01T10:00:00.000Z", "repo-1"));

    const failed = await service.fail(
      started,
      { code: "REVIEW_FAILED", message: "Analyzer failed" },
      "2026-09-01T10:00:02.000Z",
    );

    expect(failed).toMatchObject({
      state: "failed",
      result: undefined,
      failure: { code: "REVIEW_FAILED", message: "Analyzer failed" },
    });
  });

  it("surfaces persistence failures without losing the completed review result", async () => {
    const update = vi.fn(async () => { throw new Error("storage unavailable"); });
    const persistence: ReviewRunPersistencePort = {
      create: async () => undefined,
      update,
      getById: async () => undefined,
      list: async () => [],
    };
    const service = createReviewHistoryService(persistence);
    const started = await service.start(runInput("run-1", "2026-09-01T10:00:00.000Z", "repo-1"));

    await expect(service.complete(started, result, "2026-09-01T10:00:01.000Z"))
      .rejects.toMatchObject({
        operation: "update",
        completedResult: result,
      } satisfies Partial<ReviewHistoryPersistenceError>);
    expect(update).toHaveBeenCalledOnce();
  });
});

function runInput(runId: string, startedAt: string, repositoryId: string) {
  return {
    runId,
    repository: { id: repositoryId, owner: "acme", name: "reviewer" },
    execution: { mode: "files" as const },
    startedAt,
  };
}
