import type { OperationalTelemetryPort } from "../observability";
import type { AIReviewerPort, ReviewConfiguration, SourceFile } from "../review";
import type {
  PlatformRepositoryIdentity,
  PlatformReviewRequest,
  PlatformReviewResponse,
} from "./contracts";

export interface PlatformSourceBundle {
  readonly files: readonly SourceFile[];
  readonly baseFiles?: readonly SourceFile[];
}

export interface PlatformSourceProviderPort {
  load(input: {
    readonly reference: string;
    readonly repository?: PlatformRepositoryIdentity;
  }): Promise<PlatformSourceBundle>;
}

export interface PlatformConfigurationProviderPort {
  load(reference: string): Promise<ReviewConfiguration>;
}

export interface PlatformReviewPublisherPort {
  publish(response: PlatformReviewResponse): Promise<void>;
}

export interface PlatformRunPersistencePort {
  save(response: PlatformReviewResponse): Promise<void>;
}

export interface PlatformTelemetryEvent {
  readonly name: "platform.review.started" | "platform.review.completed" | "platform.review.failed";
  readonly correlationId?: string;
  readonly mode: PlatformReviewRequest["review"]["mode"];
  readonly message?: string;
}

export interface PlatformTelemetryPort {
  record(event: PlatformTelemetryEvent): void | Promise<void>;
}

export interface PlatformReviewServiceDependencies {
  readonly reviewUseCases: import("../review").ReviewUseCases;
  readonly aiReviewer?: AIReviewerPort;
  readonly sourceProvider?: PlatformSourceProviderPort;
  readonly configurationProvider?: PlatformConfigurationProviderPort;
  readonly publisher?: PlatformReviewPublisherPort;
  readonly persistence?: PlatformRunPersistencePort;
  readonly telemetry?: PlatformTelemetryPort;
  readonly operationalTelemetry?: OperationalTelemetryPort;
  readonly now?: () => number;
}
