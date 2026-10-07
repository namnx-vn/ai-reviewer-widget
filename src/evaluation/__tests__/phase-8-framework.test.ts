import { describe, expect, it } from "vitest";

import { createDefaultReviewUseCases } from "../../application/review";
import {
  PHASE_8_FRAMEWORK_CORPUS,
  runPhase8FrameworkQualification,
} from "../phase-8-framework";

describe("Phase 8 framework corpus", () => {
  it("covers the required framework and repository dimensions", () => {
    const dimensions = PHASE_8_FRAMEWORK_CORPUS.map((entry) => entry.dimensions);

    expect(new Set(dimensions.map((value) => value.reactMajor))).toEqual(new Set([18, 19]));
    expect(new Set(dimensions.map((value) => value.compiler))).toEqual(
      new Set(["enabled", "disabled", "unknown"]),
    );
    expect(new Set(dimensions.map((value) => value.nextMajor))).toEqual(
      new Set([15, 16, undefined]),
    );
    expect(new Set(dimensions.map((value) => value.router))).toEqual(
      new Set(["app", "pages", "mixed", "none"]),
    );
    expect(new Set(dimensions.map((value) => value.appLayout))).toEqual(
      new Set(["app", "src/app", "none"]),
    );
    expect(new Set(dimensions.map((value) => value.runtime))).toEqual(
      new Set(["node", "edge", "mixed", "unknown"]),
    );
    expect(new Set(PHASE_8_FRAMEWORK_CORPUS.map((entry) => entry.expectation))).toEqual(
      new Set(["positive-defect", "negative-control"]),
    );
  });

  it("runs through the production pipeline but refuses to qualify synthetic evidence", () => {
    const report = runPhase8FrameworkQualification(
      createDefaultReviewUseCases(),
      PHASE_8_FRAMEWORK_CORPUS,
      { generatedAt: () => "2026-10-01T00:00:00.000Z" },
    );

    expect(report.generatedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(report.status).toBe("insufficient-evidence");
    expect(report.rollout).toBe("advisory");
    expect(report.metrics.deterministicRepeatability).toBe(1);
    expect(report.metrics.ruleCrashRate).toBe(0);
    expect(report.metrics.protectedFalsePositiveRegressions).toBe(0);
    expect(report.metrics.versionGatingRegressions).toBe(0);
    expect(report.reasons).toContain("Synthetic fixtures are not empirical qualification evidence");
  });
});
