import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ReviewFile } from "../review/reviewer";

const SOURCE_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const IGNORED_DIRECTORIES = new Set([".git", "dist", "node_modules", "coverage"]);

export function collectWorkspaceFiles(cwd: string): ReviewFile[] {
  return collectPathFiles(cwd, cwd);
}

export function collectTargetFiles(cwd: string, targetPath: string): ReviewFile[] {
  const absolutePath = resolve(cwd, targetPath);
  return collectPathFiles(absolutePath, cwd);
}

export function collectDiffFiles(cwd: string): ReviewFile[] {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"],
    { cwd, encoding: "utf-8" },
  );

  return output
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter((path) => path.length > 0 && SOURCE_FILE_PATTERN.test(path))
    .map((path) => readReviewFile(resolve(cwd, path), cwd));
}

function collectPathFiles(path: string, cwd: string): ReviewFile[] {
  const stats = statSync(path);
  if (stats.isFile()) {
    return SOURCE_FILE_PATTERN.test(path) ? [readReviewFile(path, cwd)] : [];
  }

  if (!stats.isDirectory()) return [];

  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !(entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)))
    .flatMap((entry) => collectPathFiles(resolve(path, entry.name), cwd));
}

function readReviewFile(path: string, cwd: string): ReviewFile {
  return {
    path: normalizePath(relative(cwd, path)),
    content: readFileSync(path, "utf-8"),
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
