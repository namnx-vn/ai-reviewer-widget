import { describe, expect, it } from "vitest";

import {
  assertSupportedDeveloperFeedbackSchema,
  assertSupportedOrganizationPolicySchema,
  assertSupportedReviewHistorySchema,
  UnsupportedSchemaVersionError,
} from "../index";

describe("v1 schema compatibility guards", () => {
  it("accepts supported v1 schemas", () => {
    expect(() => assertSupportedReviewHistorySchema({ schemaVersion: 1 })).not.toThrow();
    expect(() => assertSupportedDeveloperFeedbackSchema({ version: 1 })).not.toThrow();
    expect(() => assertSupportedOrganizationPolicySchema({ schemaVersion: 1 })).not.toThrow();
  });

  it("rejects unsupported versions explicitly instead of reinterpreting them", () => {
    expect(() => assertSupportedReviewHistorySchema({ schemaVersion: 2 })).toThrow(UnsupportedSchemaVersionError);
    expect(() => assertSupportedDeveloperFeedbackSchema({ version: 2 })).toThrow(
      "Unsupported developer-feedback schema version: 2; expected 1.",
    );
    expect(() => assertSupportedOrganizationPolicySchema({ schemaVersion: 0 })).toThrow(
      "Unsupported organization-policy schema version: 0; expected 1.",
    );
  });
});
