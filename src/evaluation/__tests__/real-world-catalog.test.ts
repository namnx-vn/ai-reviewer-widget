import { describe, expect, it } from "vitest";

import {
  countRealWorldCatalogByCategory,
  countRealWorldCatalogBySignal,
  REAL_WORLD_PR_CATALOG,
} from "../real-world-catalog";
import { loadRealWorldEvaluationCorpus } from "../real-world";

describe("100-PR real-world catalog", () => {
  it("contains exactly 100 unique public pull requests with balanced quotas", () => {
    expect(REAL_WORLD_PR_CATALOG).toHaveLength(100);

    const identities = REAL_WORLD_PR_CATALOG.map(
      ({ repository, number }) => `${repository}#${number}`,
    );
    expect(new Set(identities).size).toBe(100);

    expect(countRealWorldCatalogByCategory("security")).toBe(20);
    expect(countRealWorldCatalogByCategory("react-hooks")).toBe(15);
    expect(countRealWorldCatalogByCategory("performance")).toBe(20);
    expect(countRealWorldCatalogByCategory("nextjs-rsc")).toBe(30);
    expect(countRealWorldCatalogByCategory("clean")).toBe(15);
  });

  it("keeps canonical provenance and reserves clean PRs as negative controls", () => {
    for (const entry of REAL_WORLD_PR_CATALOG) {
      expect(entry.url).toBe(
        `https://github.com/${entry.repository}/pull/${entry.number}`,
      );
      expect(entry.title.length).toBeGreaterThan(0);
    }

    const cleanEntries = REAL_WORLD_PR_CATALOG.filter(
      ({ category }) => category === "clean",
    );
    expect(cleanEntries).toHaveLength(15);
    expect(cleanEntries.every(({ signal }) => signal === "negative-control")).toBe(true);
    expect(countRealWorldCatalogBySignal("negative-control")).toBeGreaterThanOrEqual(15);
  });

  it("links every executable minimized seed back to the 100-PR catalog", () => {
    const executableCorpus = loadRealWorldEvaluationCorpus();
    const minimizedEntries = REAL_WORLD_PR_CATALOG.filter(
      ({ maturity }) => maturity === "minimized",
    );

    expect(executableCorpus).toHaveLength(50);
    expect(minimizedEntries).toHaveLength(50);

    for (const item of executableCorpus) {
      const catalogEntry = minimizedEntries.find(
        ({ repository, number }) =>
          repository === item.source.repository && number === item.source.number,
      );

      expect(catalogEntry).toBeDefined();
      expect(catalogEntry?.fixtureId).toBe(item.evaluationCase.id);
    }
  });

  it("does not treat the known XSS-producing Preact SSR guide as a clean control", () => {
    expect(
      REAL_WORLD_PR_CATALOG.some(
        ({ repository, number }) => repository === "TanStack/query" && number === 11380,
      ),
    ).toBe(false);

    const replacement = REAL_WORLD_PR_CATALOG.find(
      ({ repository, number }) => repository === "TanStack/query" && number === 11258,
    );

    expect(replacement?.category).toBe("clean");
    expect(replacement?.signal).toBe("negative-control");
    expect(replacement?.maturity).toBe("minimized");
    expect(replacement?.fixtureId).toBe("tanstack-query-11258-test-file-alignment");
  });

  it("keeps the Rust-only clean candidate catalogued until the runner supports it", () => {
    const rustOnly = REAL_WORLD_PR_CATALOG.find(
      ({ repository, number }) => repository === "vercel/next.js" && number === 97284,
    );

    expect(rustOnly?.category).toBe("clean");
    expect(rustOnly?.maturity).toBe("catalogued");
    expect(rustOnly?.fixtureId).toBeUndefined();
  });
});
