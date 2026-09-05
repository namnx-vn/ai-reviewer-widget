import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cache = new Map<string, readonly string[]>();

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
  const loaded = require(configPath) as { readonly pageExtensions?: readonly string[] };
  const extensions = loaded.pageExtensions ?? ["tsx", "ts", "jsx", "js"];
  cache.set(root, extensions);
  return extensions;
}
