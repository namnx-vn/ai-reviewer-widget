import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../run";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local review CLI", () => {
  it("prints help and built-in rule families without reading the workspace", () => {
    const help = createIO(createTemporaryDirectory());
    const rules = createIO(createTemporaryDirectory());

    expect(runCli(["--help"], help.io)).toBe(0);
    expect(help.stdout.join("")).toContain("Usage:");
    expect(runCli(["rules"], rules.io)).toBe(0);
    expect(rules.stdout.join("")).toContain("security");
  });

  it("reviews a selected source file and returns a failing exit code for critical findings", () => {
    const directory = createTemporaryDirectory();
    mkdirSync(resolve(directory, "src"));
    writeFileSync(resolve(directory, "src/example.ts"), 'eval("input");', "utf-8");
    const output = createIO(directory);

    expect(runCli(["review", "--file", "src/example.ts"], output.io)).toBe(1);
    expect(output.stdout.join("")).toContain("Decision: FAIL");
    expect(output.stdout.join("")).toContain("security.no-eval");
  });

  it("reports an empty workspace without treating it as an error", () => {
    const output = createIO(createTemporaryDirectory());

    expect(runCli(["review"], output.io)).toBe(0);
    expect(output.stdout).toEqual(["No reviewable source files found.\n"]);
  });

  it("initializes configuration once and reports duplicate initialization", () => {
    const directory = createTemporaryDirectory();
    const first = createIO(directory);
    const duplicate = createIO(directory);

    expect(runCli(["init"], first.io)).toBe(0);
    expect(JSON.parse(readFileSync(resolve(directory, ".ai-reviewer.json"), "utf-8"))).toEqual({
      version: 1,
    });
    expect(runCli(["init"], duplicate.io)).toBe(2);
    expect(duplicate.stderr.join("")).toContain("already exists");
  });

  it("returns an adapter error code for invalid arguments", () => {
    const output = createIO(createTemporaryDirectory());

    expect(runCli(["unknown"], output.io)).toBe(2);
    expect(output.stderr.join("")).toContain("Unknown command");
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "ai-reviewer-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createIO(cwd: string): {
  readonly io: {
    readonly cwd: string;
    readonly stdout: (message: string) => void;
    readonly stderr: (message: string) => void;
  };
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      cwd,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    },
    stdout,
    stderr,
  };
}
