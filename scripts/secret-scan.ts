import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface SecretMatch {
  readonly path: string;
  readonly line: number;
  readonly label: string;
}

const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const ASSIGNMENT_PATTERN = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization|database[_-]?url)\b\s*[:=]\s*["']([A-Za-z0-9._~+/=:?&%-]{16,})["']/gi;
const BEARER_PATTERN = /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/gi;
const PLACEHOLDER_PATTERN = /(?:example|test|dummy|fake|changeme|replace|redacted|masked|placeholder|process\.env|\$\{|<|your-|from-environment)/i;

const EXCLUDED_PATH_PREFIXES = [
  ".git/",
  "coverage/",
  "dist/",
  "docs/",
  "node_modules/",
  "plans/",
  "test-results/",
];

const EXCLUDED_PATH_PARTS = [
  "/__tests__/",
  "/fixtures/",
];

const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /^package-lock\.json$/,
  /^tsconfig\..*\.tsbuildinfo$/,
];

const INCLUDED_FILE_PATTERNS = [
  /^\.(?:github|npmrc|env)/,
  /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|env|ini|conf|config)$/i,
];

async function main(): Promise<void> {
  const files = await listTrackedFiles();
  const matches = (
    await Promise.all(files.filter(shouldScan).map(scanFile))
  ).flat();

  if (matches.length === 0) {
    process.stdout.write("Secret scan passed: no committed credential patterns found.\n");
    return;
  }

  process.stderr.write("Secret scan failed. Potential credentials found:\n");
  for (const match of matches) {
    process.stderr.write(`- ${match.path}:${match.line} ${match.label}\n`);
  }
  process.exitCode = 1;
}

async function listTrackedFiles(): Promise<readonly string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files"], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.split("\n").map((file) => file.trim()).filter(Boolean);
}

function shouldScan(path: string): boolean {
  return !EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
    && !EXCLUDED_PATH_PARTS.some((part) => path.includes(part))
    && !EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(path))
    && INCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

async function scanFile(path: string): Promise<readonly SecretMatch[]> {
  const content = await readFile(path, "utf8");
  return [
    ...findMatches(path, content, PRIVATE_KEY_PATTERN, "private key material"),
    ...findMatches(path, content, ASSIGNMENT_PATTERN, "credential assignment"),
    ...findMatches(path, content, BEARER_PATTERN, "bearer credential"),
  ];
}

function findMatches(
  path: string,
  content: string,
  pattern: RegExp,
  label: string,
): readonly SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const match of content.matchAll(pattern)) {
    const value = match[0] ?? "";
    if (PLACEHOLDER_PATTERN.test(value)) continue;
    matches.push({
      path,
      line: lineForIndex(content, match.index ?? 0),
      label,
    });
  }
  return matches;
}

function lineForIndex(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof Error
      ? `Secret scan failed: ${error.message}\n`
      : "Secret scan failed.\n",
  );
  process.exitCode = 1;
});
