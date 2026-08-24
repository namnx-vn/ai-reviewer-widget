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

export interface AIReviewContextInput {
  readonly title: string;
  readonly description?: string;
  readonly deterministicFindings: string;
  readonly files: readonly AIReviewPatch[];
}

export interface PreparedAIReviewContext extends PreparedAIInput {
  readonly title: string;
  readonly description?: string;
  readonly deterministicFindings: string;
}

const MAX_PATCH_CHARACTERS = 30_000;
const MAX_TOTAL_CHARACTERS = 120_000;
const MAX_TITLE_CHARACTERS = 500;
const MAX_DESCRIPTION_CHARACTERS = 10_000;
const MAX_FINDINGS_CHARACTERS = 30_000;
const MAX_PATH_CHARACTERS = 1_000;
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
    const path = prepareText(file.path, MAX_PATH_CHARACTERS);
    redactedValues += redacted.count + path.redactedValues;
    const limitedPatch = redacted.value.slice(0, MAX_PATCH_CHARACTERS);
    truncated = truncated || limitedPatch.length < redacted.value.length || path.truncated;
    sections.push(`FILE: ${path.value}\n${limitedPatch}`);
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

/** Applies the outbound AI data policy to every external string field. */
export function prepareAIReviewContext(
  input: AIReviewContextInput,
): PreparedAIReviewContext {
  const preparedDiff = prepareAIReviewDiff(input.files);
  const title = prepareText(input.title, MAX_TITLE_CHARACTERS);
  const description = input.description === undefined
    ? undefined
    : prepareText(input.description, MAX_DESCRIPTION_CHARACTERS);
  const deterministicFindings = prepareText(
    input.deterministicFindings,
    MAX_FINDINGS_CHARACTERS,
  );

  return {
    ...preparedDiff,
    title: title.value,
    description: description?.value,
    deterministicFindings: deterministicFindings.value,
    redactedValues: preparedDiff.redactedValues
      + title.redactedValues
      + (description?.redactedValues ?? 0)
      + deterministicFindings.redactedValues,
    truncated: preparedDiff.truncated
      || title.truncated
      || (description?.truncated ?? false)
      || deterministicFindings.truncated,
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

function prepareText(
  source: string,
  maximumCharacters: number,
): {
  readonly value: string;
  readonly redactedValues: number;
  readonly truncated: boolean;
} {
  const redacted = redactPatch(source);
  const value = redacted.value.slice(0, maximumCharacters);
  return {
    value,
    redactedValues: redacted.count,
    truncated: value.length < redacted.value.length,
  };
}
