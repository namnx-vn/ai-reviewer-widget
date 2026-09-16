import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryLearningStore } from "../../application/improvement";
import type { PromotionQualityInput } from "../../evaluation";
import { createFilePromotionQualityPort, verifyQualitySourceEvidence } from "../intelligence-quality";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const counts = { truePositives: 1, falsePositives: 0, blockingTruePositives: 1, blockingFalsePositives: 0,
  positiveExpected: 1, positiveDetected: 1, protectedPositiveExpected: 1, protectedPositiveDetected: 1,
  criticalPositiveExpected: 1, criticalPositiveDetected: 1, criticalFalsePositives: 0,
  negativeControls: 1, negativeControlFalsePositives: 0, unadjudicated: 0 };
async function evidence() {
  const cwd = mkdtempSync(join(tmpdir(), "quality-evidence-")); directories.push(cwd);
  const artifact = "reviewer candidate data; never executed";
  writeFileSync(join(cwd, "candidate.patch"), artifact);
  const artifactDigest = createHash("sha256").update(artifact).digest("hex");
  const sourceHeadSha = "a".repeat(40);
  const source = JSON.stringify({ repositoryId: "verified/repo", snapshotId: sourceHeadSha,
    files: [{ path: "src/run.ts", content: "export function run(value: string) { return eval(value); }" }],
    expectedPaths: ["src/run.ts"], expectedFindings: [{ id: "eval", ruleId: "security.no-eval", severity: "critical", file: "src/run.ts" }] });
  writeFileSync(join(cwd, "snapshot.json"), source);
  const input: PromotionQualityInput = {
    candidateId: "candidate-1", artifactDigest, baselineVersion: "0", datasetVersion: "dataset-1", ruleFamily: "security.no-eval",
    candidateExposure: { caseIds: ["dev"], repositoryIds: ["dev/repo"], trainedThrough: "2025-01-01T00:00:00.000Z" },
    manifest: { schemaVersion: "1", manifestId: "test-manifest", development: [{ caseId: "dev", repositoryId: "dev/repo", observedAt: "2024-01-01T00:00:00.000Z" }],
      calibration: [{ caseId: "cal", repositoryId: "cal/repo", observedAt: "2025-01-01T00:00:00.000Z" }],
      protectedHoldout: [{ caseId: "protected", repositoryId: "verified/repo", observedAt: "2026-01-01T00:00:00.000Z" }] },
    policy: { policyVersion: "test-only-low-floor", minimumCases: 1, minimumRepositories: 1, minimumPrecisionRepositories: 1,
      minimumBlockingPrecisionRepositories: 1, minimumPositiveExpectations: 1, minimumProtectedPositiveExpectations: 1,
      minimumCriticalPositiveExpectations: 1, minimumNegativeControls: 1, minimumPrecision: 0.1,
      minimumBlockingPrecision: 0.1, minimumRecall: 1, maximumRecallRegression: 0, maximumNegativeControlFalsePositives: 0 },
    cases: [{ caseId: "protected", repositoryId: "verified/repo", observedAt: "2026-01-01T00:00:00.000Z",
      fidelity: "verified-source", adjudicationRef: "audit.json", snapshotRef: "snapshot.json", ruleFamily: "security.no-eval",
      executionSucceeded: true, contextComplete: true, candidate: counts, production: counts }],
  };
  const audit = { schemaVersion: 1, caseId: "protected", repositoryId: "verified/repo", observedAt: input.cases[0].observedAt,
    ruleFamily: input.ruleFamily, candidateId: input.candidateId, artifactDigest, baselineVersion: "0", datasetVersion: "dataset-1",
    policyVersion: input.policy.policyVersion, verdictsComplete: true, adjudicatorId: "fixture-reviewer", sourceHeadSha,
    snapshotDigest: createHash("sha256").update(source).digest("hex"), candidate: counts, production: counts };
  writeFileSync(join(cwd, "audit.json"), JSON.stringify(audit));
  writeFileSync(join(cwd, "bundle.json"), JSON.stringify(input));
  const store = createInMemoryLearningStore();
  await store.append({ version: 1, kind: "candidate", eventId: "proposal", recordedAt: "2026-01-01T00:00:00.000Z",
    candidateId: input.candidateId, artifactDigest, artifactRef: "candidate.patch", parentVersion: 0, repositoryId: "dev/repo",
    outcomeRefs: ["failure"], mandatoryControls: "preserved" }, 0);
  const request = { candidateId: input.candidateId, artifactDigest, baselineVersion: 0, evaluationRef: "bundle.json",
    datasetVersion: "dataset-1", policyVersion: input.policy.policyVersion };
  return { cwd, input, audit, store, request, approvedPolicy: Object.freeze({ ...input.policy }) };
}

describe("trusted file quality receipt adapter", () => {
  it("rejects lowered safety thresholds under the same approved policy version", async () => {
    const data = await evidence();
    writeFileSync(join(data.cwd, "bundle.json"), JSON.stringify({ ...data.input, policy: { ...data.input.policy, minimumPrecision: 0 } }));
    const port = createFilePromotionQualityPort({ ...data, evidenceAuthorized: true });
    await expect(port.evaluate(data.request)).rejects.toThrow("approved immutable");
  });

  it("requires authorized source audits even when the supplied score passes", async () => {
    const data = await evidence();
    const pending = await createFilePromotionQualityPort({ ...data, evidenceAuthorized: false }).evaluate(data.request);
    expect(pending).toMatchObject({ verified: false, status: "insufficient-evidence", independentHoldout: false });
    const verified = await createFilePromotionQualityPort({ ...data, evidenceAuthorized: true }).evaluate(data.request);
    expect(verified).toMatchObject({ verified: true, status: "pass", independentHoldout: true, baselineVersion: 0 });
  });
  it("rejects swapped candidate receipts and changed candidate artifacts", async () => {
    const data = await evidence(), port = createFilePromotionQualityPort({ ...data, evidenceAuthorized: true });
    await expect(port.evaluate({ ...data.request, candidateId: "another-candidate" })).rejects.toThrow("identity");
    writeFileSync(join(data.cwd, "candidate.patch"), "changed artifact");
    await expect(port.evaluate(data.request)).rejects.toThrow("artifact");
  });
  it.each(["snapshotDigest", "candidateId", "sourceHeadSha", "policyVersion"])("rejects inconsistent audit %s", async (field) => {
    const data = await evidence();
    writeFileSync(join(data.cwd, "audit.json"), JSON.stringify({ ...data.audit, [field]: "wrong" }));
    expect(await verifyQualitySourceEvidence(data.input, data.cwd)).toBe(false);
  });
  it("rejects incomplete captures and mismatched labels despite an approved audit", async () => {
    const data = await evidence();
    writeFileSync(join(data.cwd, "audit.json"), JSON.stringify({ ...data.audit, candidate: { ...counts, falsePositives: 1 } }));
    expect(await verifyQualitySourceEvidence(data.input, data.cwd)).toBe(false);
    writeFileSync(join(data.cwd, "snapshot.json"), JSON.stringify({ repositoryId: "verified/repo", snapshotId: "a".repeat(40),
      files: [], expectedPaths: ["src/run.ts"], expectedFindings: [] }));
    expect(await verifyQualitySourceEvidence(data.input, data.cwd)).toBe(false);
  });
});
