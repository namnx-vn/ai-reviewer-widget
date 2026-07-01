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