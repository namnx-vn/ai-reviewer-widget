import type { ResolvedReviewConfiguration } from "../../config";
import type {
  PlatformReviewRequest,
  PlatformReviewResponse,
  PlatformReviewService,
} from "../platform";
import type {
  EffectivePolicyContextV1,
  InvocationPolicyOverrides,
  OrganizationIdentity,
} from "./contracts";
import type { OrganizationPolicyProviderPort } from "./ports";
import { resolveOrganizationPolicy } from "./resolve";

export interface GovernedPlatformReviewRequest {
  readonly organization: OrganizationIdentity;
  readonly request: PlatformReviewRequest;
  readonly invocationOverrides?: InvocationPolicyOverrides;
}

export interface GovernedPlatformReviewResponse {
  readonly response: PlatformReviewResponse;
  readonly policy: EffectivePolicyContextV1;
}

export interface GovernedPlatformReviewService {
  review(input: GovernedPlatformReviewRequest): Promise<GovernedPlatformReviewResponse>;
}

export function createGovernedPlatformReviewService(dependencies: {
  readonly platform: PlatformReviewService;
  readonly policyProvider: OrganizationPolicyProviderPort;
  readonly builtInConfiguration: ResolvedReviewConfiguration;
}): GovernedPlatformReviewService {
  return {
    async review(input) {
      const policy = await dependencies.policyProvider.load({
        organization: input.organization,
        repository: input.request.repository,
      });
      const context = resolveOrganizationPolicy({
        organization: input.organization,
        policy,
        builtInConfiguration: dependencies.builtInConfiguration,
        repositoryConfiguration: input.request.configuration,
        invocationOverrides: input.invocationOverrides,
      });
      const response = await dependencies.platform.review({
        ...input.request,
        configuration: context.effectiveConfiguration,
        configurationReference: undefined,
      });
      return { response, policy: context };
    },
  };
}
