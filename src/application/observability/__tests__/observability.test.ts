import { describe, expect, it, vi } from "vitest";

import {
  categoryForReviewWarning,
  formatDeveloperDiagnostic,
  recordOperationalTelemetry,
} from "..";

describe("operational observability", () => {
  it("isolates telemetry sink failures", () => {
    expect(() => recordOperationalTelemetry({
      record: () => { throw new Error("sink unavailable"); },
    }, {
      type: "stage",
      stage: "review.execution",
      outcome: "completed",
      durationMs: 7,
    })).not.toThrow();
  });

  it("classifies stable review warning categories", () => {
    expect(categoryForReviewWarning("SOURCE_PARSE_FAILED")).toBe("source");
    expect(categoryForReviewWarning("SECURITY_RULE_FAILED")).toBe("analyzer");
    expect(categoryForReviewWarning("AI_INPUT_REDACTED")).toBe("ai-provider");
  });

  it("formats developer diagnostics without raw messages", () => {
    expect(formatDeveloperDiagnostic({
      category: "persistence",
      stage: "persistence.save",
      code: "PERSISTENCE_FAILED",
    })).toBe("persistence:persistence.save:PERSISTENCE_FAILED");
  });

  it("records only the structured event supplied by the application", () => {
    const record = vi.fn();
    recordOperationalTelemetry({ record }, {
      type: "diagnostic",
      category: "configuration",
      outcome: "failed",
      code: "CONFIG_INVALID_VALUE",
    });

    expect(record).toHaveBeenCalledWith({
      type: "diagnostic",
      category: "configuration",
      outcome: "failed",
      code: "CONFIG_INVALID_VALUE",
    });
  });
});
