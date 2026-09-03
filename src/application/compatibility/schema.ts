import { ORGANIZATION_POLICY_SCHEMA_VERSION } from "../governance";
import { REVIEW_RUN_SCHEMA_VERSION } from "../history";
import { DEVELOPER_FEEDBACK_SCHEMA_VERSION } from "../feedback";

export class UnsupportedSchemaVersionError extends Error {
  constructor(
    readonly schema: string,
    readonly receivedVersion: number,
    readonly supportedVersion: number,
  ) {
    super(`Unsupported ${schema} schema version: ${receivedVersion}; expected ${supportedVersion}.`);
    this.name = "UnsupportedSchemaVersionError";
  }
}

export function assertSupportedReviewHistorySchema(
  value: { readonly schemaVersion: number },
): void {
  assertVersion("review-history", value.schemaVersion, REVIEW_RUN_SCHEMA_VERSION);
}

export function assertSupportedDeveloperFeedbackSchema(
  value: { readonly version: number },
): void {
  assertVersion("developer-feedback", value.version, DEVELOPER_FEEDBACK_SCHEMA_VERSION);
}

export function assertSupportedOrganizationPolicySchema(
  value: { readonly schemaVersion: number },
): void {
  assertVersion("organization-policy", value.schemaVersion, ORGANIZATION_POLICY_SCHEMA_VERSION);
}

function assertVersion(schema: string, received: number, supported: number): void {
  if (received !== supported) {
    throw new UnsupportedSchemaVersionError(schema, received, supported);
  }
}
