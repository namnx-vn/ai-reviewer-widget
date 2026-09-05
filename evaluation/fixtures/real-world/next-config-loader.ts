import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const cache = new Map<string, readonly string[]>();
const requireFromFixture = createRequire(import.meta.url);

export function getPageExtensions(cwd: string = process.cwd()): readonly string[] {
  const root = resolve(cwd);
  const cached = cache.get(root);
  if (cached !== undefined) return cached;

  const configPath = resolve(root, "next.config.js");
  if (!existsSync(configPath)) {
    const fallback = ["tsx", "ts", "jsx", "js"] as const;
    cache.set(root, fallback);
    return fallback;
  }

  // Public PR behavior: project configuration is executable code and therefore
  // represents a trusted-repository execution boundary rather than plain data.
  const loaded: unknown = requireFromFixture(configPath);
  const extensions = readPageExtensions(loaded) ?? ["tsx", "ts", "jsx", "js"];
  cache.set(root, extensions);
  return extensions;
}

function readPageExtensions(value: unknown): readonly string[] | undefined {
  if (typeof value !== "object" || value === null || !("pageExtensions" in value)) {
    return undefined;
  }

  const extensions = value.pageExtensions;
  return Array.isArray(extensions) && extensions.every((item) => typeof item === "string")
    ? extensions
    : undefined;
}
