export interface AIReviewPatch {
  readonly path: string;
  readonly patch?: string;
}

export interface PreparedAIInput {
  readonly diff?: string;
  readonly omittedFiles: number;
  readonly redactedValues: number;
  readonly truncated: boolean;
}

const MAX_PATCH_CHARACTERS = 30_000;
const MAX_TOTAL_CHARACTERS = 120_000;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const ASSIGNMENT_SECRET_PATTERN = /\b(api[_-]?key|token|secret|password|authorization|database[_-]?url)\b(["']?\s*[:=]\s*["']?)([^\s"',;}]+)/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function prepareAIReviewDiff(
  files: readonly AIReviewPatch[],
): PreparedAIInput {
  let omittedFiles = 0;
  let redactedValues = 0;
  let truncated = false;
  const sections: string[] = [];

  for (const file of files) {
    if (file.patch === undefined || file.patch.trim().length === 0) {
      omittedFiles += 1;
      continue;
    }

    const redacted = redactPatch(file.patch);
    redactedValues += redacted.count;
    const limitedPatch = redacted.value.slice(0, MAX_PATCH_CHARACTERS);
    truncated = truncated || limitedPatch.length < redacted.value.length;
    sections.push(`FILE: ${file.path}\n${limitedPatch}`);
  }

  const combined = sections.join("\n\n");
  const diff = combined.slice(0, MAX_TOTAL_CHARACTERS);
  truncated = truncated || diff.length < combined.length;

  return {
    diff: diff.length === 0 ? undefined : diff,
    omittedFiles,
    redactedValues,
    truncated,
  };
}

function redactPatch(source: string): { readonly value: string; readonly count: number } {
  let count = 0;
  const redact = (): string => {
    count += 1;
    return "[REDACTED]";
  };
  const withoutKeys = source.replace(PRIVATE_KEY_PATTERN, redact);
  const withoutBearer = withoutKeys.replace(BEARER_PATTERN, redact);
  const value = withoutBearer.replace(
    ASSIGNMENT_SECRET_PATTERN,
    (_match, key: string, separator: string) => {
      count += 1;
      return `${key}${separator}[REDACTED]`;
    },
  );
  return { value, count };
}
