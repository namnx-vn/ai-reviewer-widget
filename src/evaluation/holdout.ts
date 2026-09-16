export interface HoldoutCase {
  caseId: string;
  repositoryId: string;
  observedAt: string;
}

export interface HoldoutManifest {
  schemaVersion: "1";
  manifestId: string;
  development: readonly HoldoutCase[];
  calibration: readonly HoldoutCase[];
  protectedHoldout: readonly HoldoutCase[];
}

export interface CandidateTrainingExposure {
  caseIds: readonly string[];
  repositoryIds: readonly string[];
  trainedThrough: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("Holdout identifiers must be nonempty canonical strings");
  }
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Holdout timestamps must be canonical ISO UTC timestamps");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error("Invalid holdout timestamp");
  }
  return value;
}

function cohort(value: unknown): readonly HoldoutCase[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Holdout cohorts must not be empty");
  return value.map((entry: unknown) => {
    if (!isRecord(entry)) throw new Error("Invalid holdout case");
    return {
      caseId: identifier(entry.caseId), repositoryId: identifier(entry.repositoryId),
      observedAt: timestamp(entry.observedAt),
    };
  });
}

function assertSeparated(earlier: readonly HoldoutCase[], later: readonly HoldoutCase[]): void {
  if (earlier.some(a => later.some(b => a.repositoryId === b.repositoryId))) {
    throw new Error("Repositories overlap between holdout cohorts");
  }
  if (earlier.some(a => later.some(b => a.observedAt >= b.observedAt))) {
    throw new Error("Holdout cohorts must be strictly temporally separated");
  }
}

export function validateHoldoutManifest(value: unknown): HoldoutManifest {
  if (!isRecord(value) || value.schemaVersion !== "1") throw new Error("Invalid holdout manifest schema");
  const manifest: HoldoutManifest = {
    schemaVersion: "1", manifestId: identifier(value.manifestId),
    development: cohort(value.development), calibration: cohort(value.calibration),
    protectedHoldout: cohort(value.protectedHoldout),
  };
  const all = [...manifest.development, ...manifest.calibration, ...manifest.protectedHoldout];
  if (new Set(all.map(entry => entry.caseId)).size !== all.length) throw new Error("Duplicate holdout case IDs");
  assertSeparated(manifest.development, manifest.calibration);
  assertSeparated(manifest.development, manifest.protectedHoldout);
  assertSeparated(manifest.calibration, manifest.protectedHoldout);
  return manifest;
}

export function assertCandidateHoldoutIsolation(
  manifest: HoldoutManifest,
  exposure: CandidateTrainingExposure,
): void {
  const validated = validateHoldoutManifest(manifest);
  const through = timestamp(exposure.trainedThrough);
  const caseIds = exposure.caseIds.map(identifier);
  const repositoryIds = exposure.repositoryIds.map(identifier);
  if (validated.protectedHoldout.some(entry =>
    caseIds.includes(entry.caseId) || repositoryIds.includes(entry.repositoryId) || through >= entry.observedAt,
  )) throw new Error("Candidate training exposure contaminates protected holdout");
}
