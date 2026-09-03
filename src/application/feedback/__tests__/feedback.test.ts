import { describe, expect, it } from "vitest";

import { fingerprintReviewFinding, type ReviewFinding } from "../../../domain/review";
import {
  createInMemoryReviewRunPersistence,
  type ReviewRunSnapshot,
} from "../../history";
import {
  createDeveloperFeedbackService,
  createInMemoryDeveloperFeedbackPersistence,
  InvalidDeveloperFeedbackError,
} from "../index";

const finding: ReviewFinding = {
  id: "finding-1",
  ruleId: "security.no-eval",
  title: "Avoid eval",
  message: "eval executes arbitrary code.",
  severity: "high",
  source: "security",
  confidence: 1,
  location: { file: "src/app.ts", line: 20 },
  suggestion: "Use a safe parser.",
};

const run: ReviewRunSnapshot = {
  schemaVersion: 1,
  runId: "run-1",
  state: "completed",
  repository: { id: "repo-1", owner: "acme", name: "app" },
  source: { commitSha: "abc123" },
  execution: { mode: "pull-request" },
  startedAt: "2026-09-03T09:00:00.000Z",
  completedAt: "2026-09-03T09:00:01.000Z",
  result: {
    score: 80,
    decision: "WARN",
    stats: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    findings: [{
      identity: "legacy-history-identity",
      ruleId: finding.ruleId,
      title: finding.title,
      message: finding.message,
      severity: finding.severity,
      source: finding.source,
      confidence: finding.confidence,
      location: finding.location,
      suggestion: finding.suggestion,
    }],
    warnings: [],
    durationMs: 10,
  },
};

function createService() {
  const feedback = createInMemoryDeveloperFeedbackPersistence();
  const history = createInMemoryReviewRunPersistence([run]);
  return {
    feedback,
    history,
    service: createDeveloperFeedbackService({ feedback, history }),
  };
}

function input(overrides: Partial<Parameters<ReturnType<typeof createDeveloperFeedbackService>["record"]>[0]> = {}) {
  return {
    feedbackId: "feedback-1",
    reviewRunId: run.runId,
    repository: { repositoryId: "repo-1", owner: "acme", name: "app" },
    findingFingerprint: fingerprintReviewFinding(finding),
    ruleId: finding.ruleId,
    findingState: "current" as const,
    action: "accepted" as const,
    reason: "Useful finding",
    recordedAt: "2026-09-03T10:00:00.000Z",
    ...overrides,
  };
}

describe("developer feedback", () => {
  it("records versioned feedback linked to the stable Phase 6 finding fingerprint", async () => {
    const { service } = createService();
    const recorded = await service.record(input());

    expect(recorded).toMatchObject({
      version: 1,
      findingFingerprint: fingerprintReviewFinding(finding),
      ruleId: "security.no-eval",
      action: "accepted",
    });
    expect(recorded).not.toHaveProperty("source");
    expect(recorded).not.toHaveProperty("content");
  });

  it("fails closed for stale review runs, wrong repositories, and invalid finding references", async () => {
    const { service } = createService();

    await expect(service.record(input({ reviewRunId: "missing" }))).rejects.toBeInstanceOf(
      InvalidDeveloperFeedbackError,
    );
    await expect(service.record(input({ repository: { repositoryId: "other" } }))).rejects.toBeInstanceOf(
      InvalidDeveloperFeedbackError,
    );
    await expect(service.record(input({ findingFingerprint: "finding-v1-deadbeef" }))).rejects.toBeInstanceOf(
      InvalidDeveloperFeedbackError,
    );
  });

  it("handles historical and deleted finding references explicitly", async () => {
    const { service } = createService();
    const historical = await service.record(input({
      feedbackId: "feedback-history",
      findingState: "historical",
      action: "fixed",
    }));
    const deleted = await service.record(input({
      feedbackId: "feedback-deleted",
      findingState: "deleted",
      action: "not-actionable",
    }));

    expect(historical.findingState).toBe("historical");
    expect(deleted.findingState).toBe("deleted");
  });

  it("exports false positives and exposes aggregate quality metrics without raw source", async () => {
    const { service } = createService();
    await service.record(input({ feedbackId: "fp", action: "false-positive", reason: "Known safe wrapper" }));
    await service.record(input({ feedbackId: "fixed", action: "fixed" }));

    const metrics = await service.metrics();
    const exported = await service.exportFalsePositives();

    expect(metrics).toMatchObject({
      version: 1,
      total: 2,
      falsePositiveRate: 0.5,
      actionableRate: 0.5,
    });
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      version: 1,
      ruleId: "security.no-eval",
      reason: "Known safe wrapper",
    });
    expect(exported[0]).not.toHaveProperty("source");
    expect(exported[0]).not.toHaveProperty("content");
  });

  it("does not mutate historical review output when governance-sensitive feedback is recorded", async () => {
    const { service, history } = createService();
    const before = await history.getById(run.runId);

    await service.record(input({ action: "false-positive", reason: "Developer disagrees" }));

    expect(await history.getById(run.runId)).toEqual(before);
  });
});
