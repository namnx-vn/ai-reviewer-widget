import type { ReviewConfiguration, SourceFile } from "../review";
import {
  PLATFORM_API_VERSION,
  type PlatformReviewRequest,
  type PlatformReviewResponse,
} from "./contracts";
import type {
  PlatformReviewServiceDependencies,
  PlatformSourceBundle,
} from "./ports";

export type PlatformReviewServiceErrorCode =
  | "PLATFORM_UNSUPPORTED_VERSION"
  | "PLATFORM_INVALID_REQUEST"
  | "PLATFORM_SOURCE_PROVIDER_REQUIRED"
  | "PLATFORM_CONFIGURATION_PROVIDER_REQUIRED";

export class PlatformReviewServiceError extends Error {
  constructor(
    readonly code: PlatformReviewServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlatformReviewServiceError";
  }
}

export interface PlatformReviewService {
  review(request: PlatformReviewRequest): Promise<PlatformReviewResponse>;
}

export function createPlatformReviewService(
  dependencies: PlatformReviewServiceDependencies,
): PlatformReviewService {
  return {
    async review(request) {
      validateRequest(request);
      await recordTelemetry(dependencies, request, "platform.review.started");

      try {
        const source = await resolveSource(request, dependencies);
        validateFiles(source.files);
        validateFiles(source.baseFiles ?? []);
        const configuration = await resolveConfiguration(request, dependencies);
        const result = request.review.mode === "files"
          ? dependencies.reviewUseCases.reviewFiles(source.files, configuration)
          : await dependencies.reviewUseCases.reviewPullRequest({
              title: request.review.title ?? "",
              description: request.review.description,
              files: source.files,
              baseFiles: source.baseFiles,
              securityQualityGate: request.review.securityQualityGate,
              configuration,
            }, dependencies.aiReviewer);
        const response: PlatformReviewResponse = {
          version: PLATFORM_API_VERSION,
          repository: request.repository,
          correlationId: request.run?.correlationId,
          result,
        };

        await dependencies.persistence?.save(response);
        await dependencies.publisher?.publish(response);
        await recordTelemetry(dependencies, request, "platform.review.completed");
        return response;
      } catch (error) {
        await recordTelemetry(
          dependencies,
          request,
          "platform.review.failed",
          error instanceof Error ? error.message : "Unknown platform review failure.",
        );
        throw error;
      }
    },
  };
}

async function resolveSource(
  request: PlatformReviewRequest,
  dependencies: PlatformReviewServiceDependencies,
): Promise<PlatformSourceBundle> {
  if (request.source.kind === "inline") {
    return {
      files: request.source.files,
      baseFiles: request.source.baseFiles,
    };
  }

  if (dependencies.sourceProvider === undefined) {
    throw new PlatformReviewServiceError(
      "PLATFORM_SOURCE_PROVIDER_REQUIRED",
      "A source provider is required for repository source references.",
    );
  }

  return dependencies.sourceProvider.load({
    reference: request.source.reference,
    repository: request.repository,
  });
}

async function resolveConfiguration(
  request: PlatformReviewRequest,
  dependencies: PlatformReviewServiceDependencies,
): Promise<ReviewConfiguration | undefined> {
  if (request.configuration !== undefined) return request.configuration;
  if (request.configurationReference === undefined) return undefined;

  if (dependencies.configurationProvider === undefined) {
    throw new PlatformReviewServiceError(
      "PLATFORM_CONFIGURATION_PROVIDER_REQUIRED",
      "A configuration provider is required for configuration references.",
    );
  }

  return dependencies.configurationProvider.load(request.configurationReference);
}

function validateRequest(request: PlatformReviewRequest): void {
  if (request.version !== PLATFORM_API_VERSION) {
    throw new PlatformReviewServiceError(
      "PLATFORM_UNSUPPORTED_VERSION",
      `Unsupported platform API version: ${String(request.version)}.`,
    );
  }
  if (request.configuration !== undefined && request.configurationReference !== undefined) {
    throw new PlatformReviewServiceError(
      "PLATFORM_INVALID_REQUEST",
      "Provide either an inline configuration or a configuration reference, not both.",
    );
  }
  if (request.source.kind === "repository" && request.source.reference.trim().length === 0) {
    throw new PlatformReviewServiceError(
      "PLATFORM_INVALID_REQUEST",
      "Repository source reference must not be empty.",
    );
  }
  if (request.configurationReference !== undefined && request.configurationReference.trim().length === 0) {
    throw new PlatformReviewServiceError(
      "PLATFORM_INVALID_REQUEST",
      "Configuration reference must not be empty.",
    );
  }
  if (request.review.mode === "pull-request" && request.review.title?.trim().length === 0) {
    throw new PlatformReviewServiceError(
      "PLATFORM_INVALID_REQUEST",
      "Pull-request review requires a non-empty title.",
    );
  }
  if (request.review.mode === "pull-request" && request.review.title === undefined) {
    throw new PlatformReviewServiceError(
      "PLATFORM_INVALID_REQUEST",
      "Pull-request review requires a title.",
    );
  }
}

function validateFiles(files: readonly SourceFile[]): void {
  for (const file of files) {
    if (!isSafeRelativePath(file.path)) {
      throw new PlatformReviewServiceError(
        "PLATFORM_INVALID_REQUEST",
        `Source path must be a safe repository-relative path: ${file.path}`,
      );
    }
  }
}

function isSafeRelativePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.length === 0 || normalized.includes("\u0000")) return false;
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return false;
  return !normalized.split("/").some((segment) => segment === "..");
}

async function recordTelemetry(
  dependencies: PlatformReviewServiceDependencies,
  request: PlatformReviewRequest,
  name: "platform.review.started" | "platform.review.completed" | "platform.review.failed",
  message?: string,
): Promise<void> {
  await dependencies.telemetry?.record({
    name,
    correlationId: request.run?.correlationId,
    mode: request.review.mode,
    message,
  });
}
