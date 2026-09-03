import { describe, expect, it } from "vitest";

import type { ReviewFinding } from "../contracts";
import {
  assertSupportedBaseline,
  createFindingBaseline,
  evaluateFindingLifecycle,
  fingerprintReviewFinding,
} from "../lifecycle";

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: "finding-1",
    ruleId: "security.no-eval",
    title: "Avoid eval",
    message: "Dynamic evaluation enables code injection.",
    severity: "high",
    source: "security",
    location: { file: "src/example.ts", line: 10, column: 3 },
    confidence: 1,
    ...overrides,
  };
}

describe("finding lifecycle", () => {
  it("preserves fingerprint identity across ordinary line movement", () => {
    const before = finding({ location: { file: "src/example.ts", line: 10, column: 3 } });
    const after = finding({ location: { file: "src/example.ts", line: 200, column: 3 } });

    expect(fingerprintReviewFinding(after)).toBe(fingerprintReviewFinding(before));
  });

  it("supports deterministic rename aliases", () => {
    const before = finding({ location: { file: "src/old-name.ts", line: 10 } });
    const after = finding({ location: { file: "src/new-name.ts", line: 30 } });
    const canonical = fingerprintReviewFinding(before);

    expect(fingerprintReviewFinding(after, { "src/new-name.ts": "src/old-name.ts" })).toBe(canonical);
  });

  it("distinguishes new, existing and resolved findings", () => {
    const existing = finding();
    const resolved = finding({
      id: "finding-2",
      ruleId: "quality.no-console",
      title: "Avoid console",
      message: "Remove debug logging.",
      source: "ast",
      severity: "medium",
      location: { file: "src/debug.ts", line: 4 },
    });
    const baseline = createFindingBaseline([existing, resolved]);
    const newFinding = finding({
      id: "finding-3",
      ruleId: "performance.large-component",
      title: "Large component",
      message: "Split this component.",
      source: "performance",
      severity: "medium",
      location: { file: "src/App.tsx", line: 50 },
    });

    const lifecycle = evaluateFindingLifecycle([existing, newFinding], baseline);

    expect(lifecycle.map(({ state }) => state).sort()).toEqual(["existing", "new", "resolved"]);
  });

  it("detects accepted findings and regressions without overloading severity", () => {
    const current = finding();
    const fingerprint = fingerprintReviewFinding(current);
    const accepted = evaluateFindingLifecycle([current], {
      version: 1,
      active: [],
      acceptedFingerprints: [fingerprint],
      resolvedFingerprints: [],
    });
    const regressed = evaluateFindingLifecycle([current], {
      version: 1,
      active: [],
      acceptedFingerprints: [],
      resolvedFingerprints: [fingerprint],
    });

    expect(accepted[0]).toMatchObject({ state: "accepted", finding: { severity: "high" } });
    expect(regressed[0]).toMatchObject({ state: "regressed", finding: { severity: "high" } });
  });

  it("applies deterministic scoped suppressions but protects mandatory rules", () => {
    const current = finding();
    const suppression = {
      ruleId: current.ruleId,
      scope: "src/**",
      reason: "Accepted migration window",
    } as const;

    expect(evaluateFindingLifecycle([current], undefined, { suppressions: [suppression] })[0])
      .toMatchObject({ state: "suppressed", suppression });
    expect(evaluateFindingLifecycle([current], undefined, {
      suppressions: [suppression],
      mandatoryRuleIds: [current.ruleId],
    })[0]?.state).toBe("new");
  });

  it("rejects unsupported baseline schema versions", () => {
    expect(() => assertSupportedBaseline({ version: 2 })).toThrow("Unsupported finding baseline version: 2");
  });
});
