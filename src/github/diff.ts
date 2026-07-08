import type { PullRequestFile } from "./pull-request";

export interface DiffHunk {
  file: string;

  oldStart: number;

  oldLines: number;

  newStart: number;

  newLines: number;

  content: string;
}

const HUNK_PATTERN =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parsePatch(
  file: string,
  patch?: string,
): DiffHunk[] {
  if (!patch) {
    return [];
  }

  const lines = patch.split("\n");

  const hunks: DiffHunk[] = [];

  let current: DiffHunk | undefined;

  for (const line of lines) {
    const match =
      line.match(HUNK_PATTERN);

    if (match) {
      if (current) {
        hunks.push(current);
      }

      current = {
        file,

        oldStart: Number(match[1]),

        oldLines: Number(match[2] ?? 1),

        newStart: Number(match[3]),

        newLines: Number(match[4] ?? 1),

        content: "",
      };

      continue;
    }

    if (current) {
      current.content += `${line}\n`;
    }
  }

  if (current) {
    hunks.push(current);
  }

  return hunks;
}

/** Returns new-file line numbers that GitHub accepts for inline review comments. */
export function getChangedLines(patch?: string): ReadonlySet<number> {
  const changedLines = new Set<number>();
  if (!patch) return changedLines;

  let newLine = 0;
  for (const line of patch.split("\n")) {
    const match = line.match(HUNK_PATTERN);
    if (match) {
      newLine = Number(match[3]);
      continue;
    }
    if (line.startsWith("+")) {
      if (!line.startsWith("+++")) changedLines.add(newLine);
      newLine += 1;
      continue;
    }
    if (!line.startsWith("-")) newLine += 1;
  }
  return changedLines;
}


export function buildPullRequestDiff(
  files: PullRequestFile[],
): string {
  return files
    .filter(
      (file) =>
        file.status !== "deleted" &&
        Boolean(file.patch),
    )
    .map(
      (file) => `
FILE: ${file.filename}

${file.patch}
`,
    )
    .join("\n");
}
