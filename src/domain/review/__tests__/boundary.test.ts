import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REVIEW_DOMAIN_DIRECTORY = dirname(dirname(fileURLToPath(import.meta.url)));
const FORBIDDEN_BOUNDARIES = [
  "application",
  "ai",
  "github",
  "ui",
  "components",
  "plugins",
  "cli",
  "scripts",
  "analyzer",
] as const;

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionTypeScriptFiles(path);
    }

    return extname(entry.name) === ".ts" ? [path] : [];
  });
}

describe("review domain boundary", () => {
  it("does not import infrastructure, application, UI, plugins, or concrete analyzers", () => {
    const forbiddenImports = productionTypeScriptFiles(REVIEW_DOMAIN_DIRECTORY)
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        const imports = source.matchAll(/from\s+["']([^"']+)["']/g);

        return [...imports]
          .map((match) => match[1])
          .filter((specifier): specifier is string => specifier !== undefined)
          .filter((specifier) => FORBIDDEN_BOUNDARIES.some(
            (boundary) => specifier.split("/").includes(boundary),
          ))
          .map((specifier) => ({ path, specifier }));
      });

    expect(forbiddenImports).toEqual([]);
  });
});
