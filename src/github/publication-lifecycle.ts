import {
  fingerprintReviewFinding,
  type ReviewFinding,
} from "../domain/review";

const MARKER_PREFIX = "<!-- ai-reviewer:finding:";
const MARKER_SUFFIX = " -->";

export interface PublishedFindingComment {
  readonly id: number;
  readonly body: string;
}

export interface GitHubFindingPublicationPlan {
  readonly create: readonly ReviewFinding[];
  readonly preserve: readonly string[];
  readonly resolve: readonly PublishedFindingComment[];
}

export function findingPublicationMarker(finding: ReviewFinding): string {
  return `${MARKER_PREFIX}${fingerprintReviewFinding(finding)}${MARKER_SUFFIX}`;
}

export function parseFindingPublicationMarker(body: string): string | undefined {
  const start = body.indexOf(MARKER_PREFIX);
  if (start < 0) return undefined;
  const valueStart = start + MARKER_PREFIX.length;
  const end = body.indexOf(MARKER_SUFFIX, valueStart);
  if (end < 0) return undefined;
  const fingerprint = body.slice(valueStart, end).trim();
  return fingerprint.length === 0 ? undefined : fingerprint;
}

export function planFindingPublication(
  findings: readonly ReviewFinding[],
  previousComments: readonly PublishedFindingComment[],
): GitHubFindingPublicationPlan {
  const previousByFingerprint = new Map(
    previousComments.flatMap((comment) => {
      const fingerprint = parseFindingPublicationMarker(comment.body);
      return fingerprint === undefined ? [] : [[fingerprint, comment] as const];
    }),
  );
  const current = [...findings]
    .map((finding) => ({ finding, fingerprint: fingerprintReviewFinding(finding) }))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const currentFingerprints = new Set(current.map(({ fingerprint }) => fingerprint));

  return {
    create: current
      .filter(({ fingerprint }) => !previousByFingerprint.has(fingerprint))
      .map(({ finding }) => finding),
    preserve: current
      .filter(({ fingerprint }) => previousByFingerprint.has(fingerprint))
      .map(({ fingerprint }) => fingerprint),
    resolve: [...previousByFingerprint]
      .filter(([fingerprint]) => !currentFingerprints.has(fingerprint))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, comment]) => comment),
  };
}

export function markPublishedCommentResolved(body: string): string {
  if (body.includes("**Status:** Resolved")) return body;
  return `${body}\n\n**Status:** Resolved`;
}

export async function withPublicationRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 2,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("Publication retry attempts must be between 1 and 3.");
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("GitHub publication failed.");
}
