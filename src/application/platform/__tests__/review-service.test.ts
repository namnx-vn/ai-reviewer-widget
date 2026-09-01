import { describe, expect, it, vi } from "vitest";

import { DEFAULT_REVIEW_CONFIGURATION } from "../../../config";
import type { ReviewResult } from "../../../domain/review";
import type {
  ReviewConfiguration,
  ReviewUseCases,
  SourceFile,
} from "../../review";
import {
  PLATFORM_API_VERSION,
  createPlatformReviewService,
  PlatformReviewServiceError,
  type PlatformReviewRequest,
} from "..";

const result: ReviewResult = {
  score: 100,
  decision: "PASS",
  findings: [],
  stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  warnings: [],
  durationMs: 3,
};

describe("platform review service", () => {
  it("maps inline file requests to existing review use cases", async () => {
    const reviewFiles = vi.fn((files: readonly SourceFile[], configuration?: ReviewConfiguration) => {
      expect(files).toEqual([{ path: "src/example.ts", content: "const value = 1;" }]);
      expect(configuration).toBe(DEFAULT_REVIEW_CONFIGURATION);
      return result;
    });
    const service = createPlatformReviewService({
      reviewUseCases: useCases({ reviewFiles }),
    });

    const response = await service.review({
      version: PLATFORM_API_VERSION,
      repository: { owner: "acme", name: "reviewer", ref: "main" },
      source: {
        kind: "inline",
        files: [{ path: "src/example.ts", content: "const value = 1;" }],
      },
      configuration: DEFAULT_REVIEW_CONFIGURATION,
      review: { mode: "files" },
      run: { correlationId: "run-123" },
    });

    expect(reviewFiles).toHaveBeenCalledOnce();
    expect(response).toEqual({
      version: PLATFORM_API_VERSION,
      repository: { owner: "acme", name: "reviewer", ref: "main" },
      correlationId: "run-123",
      result,
    });
  });

  it("resolves referenced source and configuration before pull-request review", async () => {
    const files = [{ path: "src/example.ts", content: "export const value = 1;" }];
    const baseFiles = [{ path: "src/example.ts", content: "export const value = 0;" }];
    const sourceProvider = {
      load: vi.fn(async () => ({ files, baseFiles })),
    };
    const configurationProvider = {
      load: vi.fn(async () => DEFAULT_REVIEW_CONFIGURATION),
    };
    const reviewPullRequest = vi.fn(async () => result);
    const aiReviewer = { name: "test-ai", review: vi.fn(async () => ({ findings: [] })) };
    const service = createPlatformReviewService({
      reviewUseCases: useCases({ reviewPullRequest }),
      aiReviewer,
      sourceProvider,
      configurationProvider,
    });

    await service.review({
      version: PLATFORM_API_VERSION,
      repository: { id: "repo-1", owner: "acme", name: "reviewer" },
      source: { kind: "repository", reference: "repo-source-1" },
      configurationReference: "config-1",
      review: {
        mode: "pull-request",
        title: "Add platform boundary",
        description: "Review platform orchestration",
      },
    });

    expect(sourceProvider.load).toHaveBeenCalledWith({
      reference: "repo-source-1",
      repository: { id: "repo-1", owner: "acme", name: "reviewer" },
    });
    expect(configurationProvider.load).toHaveBeenCalledWith("config-1");
    expect(reviewPullRequest).toHaveBeenCalledWith({
      title: "Add platform boundary",
      description: "Review platform orchestration",
      files,
      baseFiles,
      securityQualityGate: undefined,
      configuration: DEFAULT_REVIEW_CONFIGURATION,
    }, aiReviewer);
  });

  it("publishes, persists, and records telemetry only around the shared result", async () => {
    const publish = vi.fn(async () => undefined);
    const save = vi.fn(async () => undefined);
    const record = vi.fn(async () => undefined);
    const service = createPlatformReviewService({
      reviewUseCases: useCases(),
      publisher: { publish },
      persistence: { save },
      telemetry: { record },
    });

    const response = await service.review(fileRequest());

    expect(save).toHaveBeenCalledWith(response);
    expect(publish).toHaveBeenCalledWith(response);
    expect(record).toHaveBeenNthCalledWith(1, {
      name: "platform.review.started",
      correlationId: undefined,
      mode: "files",
      message: undefined,
    });
    expect(record).toHaveBeenNthCalledWith(2, {
      name: "platform.review.completed",
      correlationId: undefined,
      mode: "files",
      message: undefined,
    });
  });

  it("rejects unsafe caller-provided source paths before review execution", async () => {
    const reviewFiles = vi.fn(() => result);
    const service = createPlatformReviewService({
      reviewUseCases: useCases({ reviewFiles }),
    });

    await expect(service.review({
      ...fileRequest(),
      source: {
        kind: "inline",
        files: [{ path: "../secret.ts", content: "secret" }],
      },
    })).rejects.toMatchObject({
      code: "PLATFORM_INVALID_REQUEST",
    } satisfies Partial<PlatformReviewServiceError>);
    expect(reviewFiles).not.toHaveBeenCalled();
  });

  it("propagates review failures and records failed telemetry", async () => {
    const failure = new Error("review failed");
    const record = vi.fn(async () => undefined);
    const service = createPlatformReviewService({
      reviewUseCases: useCases({
        reviewFiles: () => { throw failure; },
      }),
      telemetry: { record },
    });

    await expect(service.review(fileRequest())).rejects.toBe(failure);
    expect(record).toHaveBeenLastCalledWith({
      name: "platform.review.failed",
      correlationId: undefined,
      mode: "files",
      message: "review failed",
    });
  });

  it("requires injected providers for referenced infrastructure", async () => {
    const service = createPlatformReviewService({ reviewUseCases: useCases() });

    await expect(service.review({
      version: PLATFORM_API_VERSION,
      source: { kind: "repository", reference: "repository-source" },
      review: { mode: "files" },
    })).rejects.toMatchObject({ code: "PLATFORM_SOURCE_PROVIDER_REQUIRED" });

    await expect(service.review({
      version: PLATFORM_API_VERSION,
      source: { kind: "inline", files: [] },
      configurationReference: "configuration-source",
      review: { mode: "files" },
    })).rejects.toMatchObject({ code: "PLATFORM_CONFIGURATION_PROVIDER_REQUIRED" });
  });
});

function fileRequest(): PlatformReviewRequest {
  return {
    version: PLATFORM_API_VERSION,
    source: {
      kind: "inline",
      files: [{ path: "src/example.ts", content: "const value = 1;" }],
    },
    review: { mode: "files" },
  };
}

function useCases(overrides: Partial<ReviewUseCases> = {}): ReviewUseCases {
  return {
    reviewFiles: () => result,
    reviewPullRequest: async () => result,
    ...overrides,
  };
}
