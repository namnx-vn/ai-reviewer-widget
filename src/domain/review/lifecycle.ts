import type { ReviewFinding } from "./contracts";

export type FindingLifecycleState =
  | "new"
  | "existing"
  | "suppressed"
  | "accepted"
  | "resolved"
  | "regressed";

export interface FindingIdentityInput {
  readonly ruleId: string;
  readonly path: string;
  readonly semanticContext: string;
  readonly locationClass?: string;
  readonly evidence?: string;
}

export interface FindingBaselineEntry {
  readonly fingerprint: string;
  readonly ruleId: string;
  readonly path: string;
}

export interface FindingBaselineV1 {
  readonly version: 1;
  readonly active: readonly FindingBaselineEntry[];
  readonly acceptedFingerprints: readonly string[];
  readonly resolvedFingerprints: readonly string[];
}

export interface FindingSuppression {
  readonly ruleId: string;
  readonly scope: string;
  readonly reason: string;
}

export interface FindingLifecycleRecord {
  readonly fingerprint: string;
  readonly state: FindingLifecycleState;
  readonly finding?: ReviewFinding;
  readonly baseline?: FindingBaselineEntry;
  readonly suppression?: FindingSuppression;
}

export interface FindingLifecycleOptions {
  readonly suppressions?: readonly FindingSuppression[];
  readonly mandatoryRuleIds?: readonly string[];
  readonly pathAliases?: Readonly<Record<string, string>>;
}

export const EMPTY_FINDING_BASELINE: FindingBaselineV1 = Object.freeze({
  version: 1,
  active: Object.freeze([]),
  acceptedFingerprints: Object.freeze([]),
  resolvedFingerprints: Object.freeze([]),
});

export function fingerprintFindingIdentity(input: FindingIdentityInput): string {
  const canonical = [
    input.ruleId.trim(),
    normalizePath(input.path),
    normalizeText(input.semanticContext),
    normalizeText(input.locationClass ?? "file"),
    normalizeText(input.evidence ?? ""),
  ].join("\u0000");
  return `finding-v1-${fnv1a64(canonical)}`;
}

export function fingerprintReviewFinding(
  finding: ReviewFinding,
  pathAliases: Readonly<Record<string, string>> = {},
): string {
  const originalPath = normalizePath(finding.location?.file ?? "");
  const canonicalPath = normalizePath(pathAliases[originalPath] ?? originalPath);
  return fingerprintFindingIdentity({
    ruleId: finding.ruleId,
    path: canonicalPath,
    semanticContext: `${finding.source}:${finding.title}`,
    locationClass: finding.location?.column === undefined ? "line" : "line-column",
    evidence: finding.message,
  });
}

export function evaluateFindingLifecycle(
  findings: readonly ReviewFinding[],
  baseline: FindingBaselineV1 = EMPTY_FINDING_BASELINE,
  options: FindingLifecycleOptions = {},
): readonly FindingLifecycleRecord[] {
  assertSupportedBaseline(baseline);
  const aliases = options.pathAliases ?? {};
  const mandatoryRules = new Set(options.mandatoryRuleIds ?? []);
  const accepted = new Set(baseline.acceptedFingerprints);
  const previouslyResolved = new Set(baseline.resolvedFingerprints);
  const baselineByFingerprint = new Map(baseline.active.map((entry) => [entry.fingerprint, entry]));
  const currentFingerprints = new Set<string>();

  const current = [...findings]
    .map((finding) => ({ finding, fingerprint: fingerprintReviewFinding(finding, aliases) }))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
    .map(({ finding, fingerprint }): FindingLifecycleRecord => {
      currentFingerprints.add(fingerprint);
      const baselineEntry = baselineByFingerprint.get(fingerprint);
      const suppression = mandatoryRules.has(finding.ruleId)
        ? undefined
        : matchingSuppression(finding, options.suppressions ?? [], aliases);
      if (suppression !== undefined) {
        return { fingerprint, state: "suppressed", finding, baseline: baselineEntry, suppression };
      }
      if (accepted.has(fingerprint)) {
        return { fingerprint, state: "accepted", finding, baseline: baselineEntry };
      }
      if (previouslyResolved.has(fingerprint)) {
        return { fingerprint, state: "regressed", finding, baseline: baselineEntry };
      }
      return {
        fingerprint,
        state: baselineEntry === undefined ? "new" : "existing",
        finding,
        baseline: baselineEntry,
      };
    });

  const resolved = baseline.active
    .filter((entry) => !currentFingerprints.has(entry.fingerprint))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
    .map((entry): FindingLifecycleRecord => ({
      fingerprint: entry.fingerprint,
      state: "resolved",
      baseline: entry,
    }));

  return [...current, ...resolved];
}

export function createFindingBaseline(
  findings: readonly ReviewFinding[],
  options: Pick<FindingLifecycleOptions, "pathAliases"> = {},
): FindingBaselineV1 {
  const entries = findings
    .map((finding): FindingBaselineEntry => ({
      fingerprint: fingerprintReviewFinding(finding, options.pathAliases),
      ruleId: finding.ruleId,
      path: normalizePath(options.pathAliases?.[normalizePath(finding.location?.file ?? "")] ?? finding.location?.file ?? ""),
    }))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  return {
    version: 1,
    active: uniqueByFingerprint(entries),
    acceptedFingerprints: [],
    resolvedFingerprints: [],
  };
}

export function assertSupportedBaseline(baseline: { readonly version: number }): asserts baseline is FindingBaselineV1 {
  if (baseline.version !== 1) {
    throw new Error(`Unsupported finding baseline version: ${baseline.version}`);
  }
}

function matchingSuppression(
  finding: ReviewFinding,
  suppressions: readonly FindingSuppression[],
  pathAliases: Readonly<Record<string, string>>,
): FindingSuppression | undefined {
  const originalPath = normalizePath(finding.location?.file ?? "");
  const path = normalizePath(pathAliases[originalPath] ?? originalPath);
  return [...suppressions]
    .sort((left, right) => `${left.ruleId}:${left.scope}:${left.reason}`.localeCompare(`${right.ruleId}:${right.scope}:${right.reason}`))
    .find((suppression) => suppression.ruleId === finding.ruleId && scopeMatches(suppression.scope, path));
}

function scopeMatches(scope: string, path: string): boolean {
  const normalized = normalizePath(scope);
  if (normalized === "" || normalized === "**/*" || normalized === "*") return true;
  if (normalized.endsWith("/**")) {
    const prefix = normalized.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === normalized;
}

function uniqueByFingerprint(entries: readonly FindingBaselineEntry[]): readonly FindingBaselineEntry[] {
  return [...new Map(entries.map((entry) => [entry.fingerprint, entry])).values()];
}

function normalizePath(path: string): string {
  const result: string[] = [];
  for (const segment of path.replace(/\\/g, "/").replace(/^\.\//, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop(); else result.push(segment);
  }
  return result.join("/");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
