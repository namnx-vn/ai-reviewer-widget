import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface PackageMetadata {
  readonly private?: boolean;
  readonly version: string;
  readonly files?: readonly string[];
  readonly bin?: Readonly<Record<string, string>>;
  readonly exports?: Readonly<Record<string, string>>;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const packageMetadata = parsePackageMetadata(
  JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf-8")),
);
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ai-reviewer-package-"));
const extractedPackage = resolve(temporaryRoot, "package");
const executable = resolve(extractedPackage, "dist/cli/ai-reviewer.js");

beforeAll(() => {
  expect(packageMetadata.private).not.toBe(true);
  expect(packageMetadata.files).toEqual(["dist/cli"]);
  expect(packageMetadata.bin).toEqual({ "ai-reviewer": "dist/cli/ai-reviewer.js" });
  expect(packageMetadata.exports).toEqual({ "./package.json": "./package.json" });

  const packOutput = execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--pack-destination",
      temporaryRoot,
      "--cache",
      "/private/tmp/ai-reviewer-phase43-cache",
    ],
    { cwd: repositoryRoot, encoding: "utf-8" },
  );
  const packResult = parsePackResult(packOutput);
  execFileSync("tar", ["-xzf", resolve(temporaryRoot, packResult.filename), "-C", temporaryRoot]);

  const artifactFiles = listFiles(extractedPackage);
  expect(artifactFiles).toContain("dist/cli/ai-reviewer.js");
  expect(artifactFiles.some((path) => /(^|\/)(src|scripts|plans|package-tests|__tests__)(\/|$)/.test(path)))
    .toBe(false);
});

afterAll(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe("packed ai-reviewer CLI", () => {
  it("runs deterministic help and version commands", () => {
    const help = spawnSync(executable, ["--help"], { encoding: "utf-8" });
    const version = spawnSync(executable, ["--version"], { encoding: "utf-8" });

    expect(help.status).toBe(0);
    expect(help.stdout).toContain("ai-reviewer review");
    expect(help.stderr).toBe("");
    expect(version.status).toBe(0);
    expect(version.stdout).toBe(`${packageMetadata.version}\n`);
  });

  it("does not expose or execute the CLI through a package root import", () => {
    const fixture = createFixture();
    const nodeModules = resolve(fixture, "node_modules");
    mkdirSync(nodeModules);
    symlinkSync(extractedPackage, resolve(nodeModules, "ai-reviewer-widget"), "dir");

    const imported = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", 'import("ai-reviewer-widget")'],
      { cwd: fixture, encoding: "utf-8" },
    );

    expect(imported.status).toBe(1);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  it("discovers config and reviews a file as versioned JSON", () => {
    const fixture = createFixture();
    writeFileSync(resolve(fixture, ".ai-reviewer.json"), JSON.stringify({
      version: 1,
      rules: { disabledFamilies: ["security"] },
    }), "utf-8");
    writeFileSync(resolve(fixture, "example.ts"), 'eval("input");', "utf-8");

    const review = spawnSync(
      executable,
      ["review", "--file", "example.ts", "--format", "json"],
      { cwd: fixture, encoding: "utf-8" },
    );

    expect(review.status).toBe(0);
    expect(review.stderr).toBe("");
    expect(JSON.parse(review.stdout)).toMatchObject({
      schemaVersion: 1,
      result: { decision: "PASS", findings: [] },
    });
  });

  it("returns exit code 2 for invalid packaged usage", () => {
    const invalid = spawnSync(executable, ["unknown-command"], { encoding: "utf-8" });

    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain("Unknown command");
  });

  it("reviews changed files through the diff target", () => {
    const fixture = createFixture();
    writeFileSync(resolve(fixture, "example.ts"), "export const safe = true;", "utf-8");
    execFileSync("git", ["init", "--quiet"], { cwd: fixture });
    execFileSync("git", ["add", "example.ts"], { cwd: fixture });
    execFileSync(
      "git",
      ["-c", "user.name=CLI Test", "-c", "user.email=cli@example.invalid", "commit", "--quiet", "-m", "baseline"],
      { cwd: fixture },
    );
    writeFileSync(resolve(fixture, "example.ts"), 'eval("changed");', "utf-8");

    const review = spawnSync(executable, ["review", "--diff"], {
      cwd: fixture,
      encoding: "utf-8",
    });

    expect(review.status).toBe(1);
    expect(review.stdout).toContain("security.no-eval");
  });
});

function createFixture(): string {
  const fixture = resolve(temporaryRoot, `fixture-${readdirSync(temporaryRoot).length}`);
  mkdirSync(fixture);
  return fixture;
}

function listFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? listFiles(resolve(directory, entry.name), path) : [path];
  });
}

function parsePackResult(output: string): { readonly filename: string } {
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("npm pack returned an unexpected result.");
  }
  const candidate: unknown = parsed[0];
  if (typeof candidate !== "object" || candidate === null || !("filename" in candidate)
    || typeof candidate.filename !== "string") {
    throw new Error("npm pack did not report an artifact filename.");
  }
  return { filename: candidate.filename };
}

function parsePackageMetadata(value: unknown): PackageMetadata {
  if (typeof value !== "object" || value === null || !("version" in value)
    || typeof value.version !== "string") {
    throw new Error("package.json does not contain a valid version.");
  }
  return value;
}
