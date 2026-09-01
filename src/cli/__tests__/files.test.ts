import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectWorkspaceFiles, sortDirectoryEntries } from "../files";
import { runCli } from "../run";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("CLI file collection", () => {
  it("sorts directory entries by name", () => {
    expect(sortDirectoryEntries([{ name: "z.ts" }, { name: "a.ts" }])).toEqual([
      { name: "a.ts" },
      { name: "z.ts" },
    ]);
  });

  it("sorts files and resulting findings independently of creation order", () => {
    const directory = createTemporaryDirectory();
    writeFileSync(resolve(directory, "z-last.ts"), 'console.log("z");', "utf-8");
    writeFileSync(resolve(directory, "a-first.ts"), 'console.log("a");', "utf-8");

    expect(collectWorkspaceFiles(directory).map((file) => file.path)).toEqual([
      "a-first.ts",
      "z-last.ts",
    ]);

    const stdout: string[] = [];
    expect(runCli(["review", "--format", "json"], {
      cwd: directory,
      stdout: (message) => stdout.push(message),
      stderr: () => undefined,
    })).toBe(0);
    const document = JSON.parse(stdout.join(""));
    expect(document.result.findings.map(
      (finding: { readonly location?: { readonly file: string } }) => finding.location?.file,
    )).toEqual(["a-first.ts", "z-last.ts"]);
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "ai-reviewer-files-"));
  temporaryDirectories.push(directory);
  return directory;
}
