import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REVIEW_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = resolve(REVIEW_ROOT, "../..");

describe("application review boundaries", () => {
  it("keeps ports and use cases independent from concrete adapters", () => {
    const forbidden = [
      "/ai/",
      "/analyzer/",
      "/github/",
      "/cli/",
      "/plugins/",
      "/react/",
      "/components/",
      "/ui/",
    ];
    const violations = ["ports.ts", "use-cases.ts"].flatMap((file) => {
      const absoluteFile = resolve(REVIEW_ROOT, file);
      return importSpecifiers(readFileSync(absoluteFile, "utf-8"))
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => resolve(dirname(absoluteFile), specifier).replaceAll("\\", "/"))
        .filter((target) => forbidden.some((segment) => target.includes(segment)))
        .map((target) => `${file} -> ${target}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps browser UI free from analyzer, AI, GitHub, CLI and Node adapters", () => {
    const uiRoot = resolve(REVIEW_ROOT, "../../ui");
    if (!statSync(uiRoot, { throwIfNoEntry: false })) return;
    const violations = sourceFiles(uiRoot).flatMap((file) =>
      importSpecifiers(readFileSync(file, "utf-8"))
        .filter((specifier) =>
          /(^node:|\/(?:ai|analyzer|github|cli)\/)/.test(specifier))
        .map((specifier) => `${relative(uiRoot, file)} -> ${specifier}`));

    expect(violations).toEqual([]);
  });

  it("keeps deterministic analyzers free from application and infrastructure adapters", () => {
    const analyzerRoot = resolve(SOURCE_ROOT, "analyzer");
    const forbidden = ["/ai/", "/application/", "/github/", "/ui/", "/cli/", "/plugins/"];
    const violations = sourceFiles(analyzerRoot)
      .filter((file) => !file.includes("/__tests__/"))
      .flatMap((file) => importSpecifiers(readFileSync(file, "utf-8"))
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => resolve(dirname(file), specifier).replaceAll("\\", "/"))
        .filter((target) => forbidden.some((segment) => target.includes(segment)))
        .map((target) => `${relative(analyzerRoot, file)} -> ${target}`));

    expect(violations).toEqual([]);
  });

  it("uses legacy review modules only as external compatibility facades", () => {
    const legacyTargets = [
      resolve(SOURCE_ROOT, "review/types").replaceAll("\\", "/"),
      resolve(SOURCE_ROOT, "review/scorer").replaceAll("\\", "/"),
      resolve(SOURCE_ROOT, "review/aggregator").replaceAll("\\", "/"),
      resolve(SOURCE_ROOT, "review/reviewer").replaceAll("\\", "/"),
      resolve(SOURCE_ROOT, "engine/decision").replaceAll("\\", "/"),
    ];
    const facadeFiles = new Set(legacyTargets.flatMap((target) => [`${target}.ts`, `${target}.tsx`]));
    const violations = sourceFiles(SOURCE_ROOT)
      .filter((file) => !file.includes("/__tests__/") && !facadeFiles.has(file.replaceAll("\\", "/")))
      .flatMap((file) => importSpecifiers(readFileSync(file, "utf-8"))
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => resolve(dirname(file), specifier).replaceAll("\\", "/"))
        .filter((target) => legacyTargets.includes(target))
        .map((target) => `${relative(SOURCE_ROOT, file)} -> ${target}`));

    expect(violations).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(entry.name)
        ? [path]
        : [];
  });
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}
