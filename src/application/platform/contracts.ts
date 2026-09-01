import type { ReviewResult } from "../../domain/review";
import type {
  ReviewConfiguration,
  SecurityQualityGateRequest,
  SourceFile,
} from "../review";

export const PLATFORM_API_VERSION = 1 as const;

export type PlatformApiVersion = typeof PLATFORM_API_VERSION;
export type PlatformReviewMode = "files" | "pull-request";

export interface PlatformRepositoryIdentity {
  readonly id?: string;
  readonly owner?: string;
  readonly name?: string;
  readonly ref?: string;
}

export interface PlatformRunMetadata {
  readonly correlationId?: string;
  readonly requestedAt?: string;
}

export interface InlinePlatformSource {
  readonly kind: "inline";
  readonly files: readonly SourceFile[];
  readonly baseFiles?: readonly SourceFile[];
}

export interface ReferencedPlatformSource {
  readonly kind: "repository";
  readonly reference: string;
}

export type PlatformSource = InlinePlatformSource | ReferencedPlatformSource;

export interface PlatformReviewRequest {
  readonly version: PlatformApiVersion;
  readonly repository?: PlatformRepositoryIdentity;
  readonly source: PlatformSource;
  readonly configuration?: ReviewConfiguration;
  readonly configurationReference?: string;
  readonly review: {
    readonly mode: PlatformReviewMode;
    readonly title?: string;
    readonly description?: string;
    readonly securityQualityGate?: SecurityQualityGateRequest;
  };
  readonly run?: PlatformRunMetadata;
}

export interface PlatformReviewResponse {
  readonly version: PlatformApiVersion;
  readonly repository?: PlatformRepositoryIdentity;
  readonly correlationId?: string;
  readonly result: ReviewResult;
}
