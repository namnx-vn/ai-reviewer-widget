import type { PlatformRepositoryIdentity } from "../platform";
import type { OrganizationIdentity, OrganizationPolicy } from "./contracts";

export interface OrganizationPolicyProviderPort {
  load(input: {
    readonly organization: OrganizationIdentity;
    readonly repository?: PlatformRepositoryIdentity;
  }): Promise<OrganizationPolicy>;
}
