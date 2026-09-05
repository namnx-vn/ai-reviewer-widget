import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Severity } from "../domain/review";
import { EVALUATION_CASE_VERSION, type EvaluationCase } from "./contracts";
import { PROMOTED_CLEAN_SEEDS } from "./real-world-promoted-clean";
import { PROMOTED_REACT_SEEDS } from "./real-world-promoted-react";
import { PROMOTED_SECURITY_SEEDS } from "./real-world-promoted-security";

export type RealWorldExpectationKind = "must-find" | "must-not-find" | "advisory";

export interface PublicPullRequestReference {
  readonly repository: string;
  readonly number: number;
  readonly url: string;
  readonly headSha: string;
}

export interface RealWorldExpectation {
  readonly id: string;
  readonly kind: RealWorldExpectationKind;
  readonly title: string;
  readonly severity?: Severity;
  readonly rationale: string;
}

export interface RealWorldEvaluationCase {
  readonly evaluationCase: EvaluationCase;
  readonly source: PublicPullRequestReference;
  readonly expectations: readonly RealWorldExpectation[];
}

export interface RealWorldSeedDefinition {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly fixturePath: string;
  readonly fixtureBundle?: {
    readonly path: string;
    readonly key: string;
  };
  readonly source: PublicPullRequestReference;
  readonly expectations: readonly RealWorldExpectation[];
}

const SEEDS: readonly RealWorldSeedDefinition[] = [
  {
    id: "vercel-next-91593-component-tree-negative",
    title: "Next.js component-tree performance refactor should stay low-noise",
    category: "nextjs-performance-negative",
    fixturePath: "evaluation/fixtures/real-world/next-component-tree-negative.tsx",
    source: {
      repository: "vercel/next.js",
      number: 91593,
      url: "https://github.com/vercel/next.js/pull/91593",
      headSha: "2aad49c32661e49f001ac57860e1abecb24bad6b",
    },
    expectations: [{
      id: "no-blocking-noise",
      kind: "must-not-find",
      title: "Do not invent blocking findings for the performance fast path",
      rationale: "The public PR was closed as superseded rather than for a correctness defect; this fixture protects precision on complex but intentional async/React code.",
    }],
  },
  {
    id: "vercel-next-86406-health-endpoint",
    title: "Next.js health endpoint exposes operational details",
    category: "nextjs-security-sensitive",
    fixturePath: "evaluation/fixtures/real-world/next-health-endpoint.ts",
    source: {
      repository: "vercel/next.js",
      number: 86406,
      url: "https://github.com/vercel/next.js/pull/86406",
      headSha: "1288a52e3e4f465de6d29027a9343e143dfd37a2",
    },
    expectations: [{
      id: "operational-data-exposure",
      kind: "must-find",
      title: "Flag operational details returned by a public health endpoint",
      severity: "medium",
      rationale: "The response includes process memory/uptime and can include service error messages; this is a labeled real-world security expectation even when no current deterministic rule maps to it yet.",
    }],
  },
  {
    id: "vercel-next-86408-config-loader",
    title: "Next.js ESLint config loader is a trusted-code execution boundary",
    category: "nextjs-architecture-security",
    fixturePath: "evaluation/fixtures/real-world/next-config-loader.ts",
    source: {
      repository: "vercel/next.js",
      number: 86408,
      url: "https://github.com/vercel/next.js/pull/86408",
      headSha: "2b973b9b3598aeba670b370e917d0a1ddc7dfa9a",
    },
    expectations: [
      {
        id: "no-cross-project-cache-pollution",
        kind: "must-not-find",
        title: "Do not report cross-project cache pollution after project-root keying",
        rationale: "The final minimized behavior keys cached extensions by resolved project root, addressing the historical review issue.",
      },
      {
        id: "trusted-config-execution-boundary",
        kind: "advisory",
        title: "Recognize executable project configuration as a trust boundary",
        severity: "low",
        rationale: "Loading project configuration executes repository code and may register process-wide loaders; this should remain advisory unless stronger exploit evidence exists.",
      },
    ],
  },
  ...PROMOTED_SECURITY_SEEDS,
  ...PROMOTED_REACT_SEEDS,
  ...PROMOTED_CLEAN_SEEDS,
];

function readFixtureBundleEntry(
  rootDirectory: string,
  bundlePath: string,
  key: string,
  bundleCache: Map<string, unknown>,
): string {
  const cached = bundleCache.get(bundlePath);
  const parsed: unknown = cached ?? JSON.parse(
    readFileSync(resolve(rootDirectory, bundlePath), "utf8"),
  );

  if (cached === undefined) {
    bundleCache.set(bundlePath, parsed);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid real-world fixture bundle: ${bundlePath}`);
  }

  const content: unknown = Reflect.get(parsed, key);
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(`Missing real-world fixture ${key} in ${bundlePath}`);
  }

  return content;
}

export function loadRealWorldEvaluationCorpus(
  rootDirectory: string = process.cwd(),
): readonly RealWorldEvaluationCase[] {
  const bundleCache = new Map<string, unknown>();

  return SEEDS.map((seed) => {
    const content = seed.fixtureBundle
      ? readFixtureBundleEntry(
          rootDirectory,
          seed.fixtureBundle.path,
          seed.fixtureBundle.key,
          bundleCache,
        )
      : readFileSync(resolve(rootDirectory, seed.fixturePath), "utf8");

    return {
      source: seed.source,
      expectations: seed.expectations,
      evaluationCase: {
        version: EVALUATION_CASE_VERSION,
        id: seed.id,
        title: seed.title,
        category: seed.category,
        files: [{ path: seed.fixturePath, content }],
        expectedFindings: [],
      },
    };
  });
}

export function countRealWorldExpectations(
  corpus: readonly RealWorldEvaluationCase[],
  kind: RealWorldExpectationKind,
): number {
  return corpus.reduce(
    (total, item) => total + item.expectations.filter((expectation) => expectation.kind === kind).length,
    0,
  );
}
