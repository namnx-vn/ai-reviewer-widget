import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseReviewConfiguration,
  resolveReviewConfiguration,
  type ResolvedReviewConfiguration,
  type RuleCatalog,
} from "../config";
import { createDefaultRuleCatalog } from "../analyzer";

/** Filesystem adapter only; parsing and validation stay in the config boundary. */
export function loadReviewConfiguration(
  cwd: string,
  catalog: RuleCatalog = createDefaultRuleCatalog(),
): ResolvedReviewConfiguration {
  const path = resolve(cwd, ".ai-reviewer.json");
  if (!existsSync(path)) return resolveReviewConfiguration(undefined, catalog);
  return resolveReviewConfiguration(parseReviewConfiguration(readFileSync(path, "utf-8")), catalog);
}
