import { describe, expect, it } from "vitest";
import { parseSource } from "../../ast/parser";
import {
  analyzeInterproceduralPerformanceFiles,
  analyzePerformanceFiles,
  assetPerformanceRules,
  asyncPerformanceRules,
  backpressurePerformanceRules,
  cpuPerformanceRules,
  databasePerformanceRules,
  importPerformanceRules,
  loadingPerformanceRules,
  memoryPerformanceRules,
  observabilityPerformanceRules,
  PerformanceAnalysisEngine,
  PerformanceRuleRegistry,
  transactionPerformanceRules,
} from "..";
import type { PerformanceRule, PerformanceRuleContext } from "../model/types";

function run(
  source: string,
  rules: readonly PerformanceRule[],
  options: Omit<PerformanceRuleContext, "source" | "file" | "ast"> = {},
): readonly string[] {
  const registry = new PerformanceRuleRegistry();
  rules.forEach((rule) => registry.register(rule));
  return new PerformanceAnalysisEngine().analyze({
    file: "feature.tsx",
    source,
    ast: parseSource(source),
    ...options,
  }, registry).map((finding) => finding.ruleId);
}

describe("Phase 3.7 completion", () => {
  it("detects repository dependency duplication from package-lock metadata", () => {
    const findings = analyzePerformanceFiles([
      {
        path: "package-lock.json",
        content: JSON.stringify({
          packages: {
            "node_modules/lodash": { version: "4.17.21" },
            "node_modules/a/node_modules/lodash": { version: "4.17.20" },
          },
        }),
      },
      { path: "src/feature.ts", content: 'import map from "lodash/map"; export const value = map;' },
    ]);
    expect(findings.map((finding) => finding.ruleId)).toContain("performance.duplicate-dependency");
  });

  it("covers loading and asset completion rules", () => {
    expect(run('import Report from "./reports/annual";', loadingPerformanceRules)).toEqual(expect.arrayContaining([
      "performance.missing-lazy",
      "performance.eager-optional-feature",
    ]));
    expect(run('const view = <img src="/images/payment-4k.png" />;', assetPerformanceRules)).toEqual(expect.arrayContaining([
      "performance.image",
      "performance.image.missing-lazy",
      "performance.image.missing-dimensions",
      "performance.image.oversized-source-pattern",
    ]));
  });

  it("covers async, memory, cpu, and backpressure completion rules", () => {
    expect(run('for (const id of ids) { fetch(`/x/${id}`); }', asyncPerformanceRules)).toContain("performance.async.promise-created-in-loop");
    expect(run('const cache = new Map(); cache.set(key, value);', memoryPerformanceRules)).toEqual(expect.arrayContaining([
      "performance.memory.unbounded-cache",
      "performance.memory.unbounded-map-set",
    ]));
    expect(run('for (const item of items) { users.find((user) => user.id === item.id); /x/.test(item.name); }', cpuPerformanceRules)).toEqual(expect.arrayContaining([
      "performance.algorithm.repeated-linear-search",
      "performance.algorithm.expensive-regex-loop",
    ]));
    expect(run('for (const item of items) { stream.write(item); }', backpressurePerformanceRules)).toEqual(expect.arrayContaining([
      "performance.backpressure.unbounded-producer",
      "performance.backpressure.missing-stream-control",
    ]));
  });

  it("uses configured database adapters for persistence rules", () => {
    const source = `
      async function load(ids) {
        const all = await db.users.findMany();
        for (const id of ids) await db.users.findOne(id);
        await db.users.findOne("same");
        await db.users.findOne("same");
        return all;
      }
    `;
    const ids = run(source, databasePerformanceRules, {
      databaseAdapters: [{
        callPaths: ["db.users.findOne"],
        collectionMethods: ["db.users.findMany"],
        transactionMethods: ["db.transaction"],
      }],
    });
    expect(ids).toEqual(expect.arrayContaining([
      "performance.database.query-in-loop",
      "performance.database.n-plus-one",
      "performance.database.unbounded-query",
      "performance.database.missing-pagination",
      "performance.database.repeated-identical-query",
    ]));
  });

  it("activates critical-path and observability rules only with explicit configuration", () => {
    const source = `
      async function authorizePayment() {
        for (;;) {
          await fetch("/post", { method: "POST" });
          break;
        }
        await fetch("/a");
        await fetch("/b");
        await fetch("/c");
      }
    `;
    expect(run(source, transactionPerformanceRules, { criticalEntrypoints: ["authorizePayment"] })).toEqual(expect.arrayContaining([
      "performance.transaction.external-call-in-critical-section",
      "performance.transaction.excessive-roundtrips",
      "performance.transaction.sequential-independent-work",
      "performance.transaction.non-idempotent-retry",
    ]));
    expect(run(source, observabilityPerformanceRules, {
      criticalEntrypoints: ["authorizePayment"],
      telemetryCallPaths: ["telemetry.span"],
    })).toEqual(expect.arrayContaining([
      "performance.observability.critical-path-without-latency-boundary",
      "performance.observability.external-call-without-timing-context",
    ]));
  });

  it("propagates costs through cross-file imports and exports", () => {
    const result = analyzeInterproceduralPerformanceFiles([
      { path: "api.ts", content: 'export async function loadBalance() { return fetch("/balance"); }' },
      { path: "service.ts", content: 'import { loadBalance } from "./api"; export async function getOverview() { return loadBalance(); }' },
    ]);
    const overview = result.summaries.find((summary) => summary.file === "service.ts" && summary.name === "getOverview");
    expect(overview?.costKinds).toEqual(expect.arrayContaining(["network", "external-service"]));
    expect(overview?.returnsCostKinds).toEqual(expect.arrayContaining(["network", "external-service"]));
  });

  it("registers every bundle completion rule", () => {
    expect(importPerformanceRules.map((rule) => rule.meta.id)).toEqual([
      "performance.large-import",
      "performance.duplicate-dependency",
      "performance.barrel-overimport",
      "performance.heavy-library-whole-import",
      "performance.duplicate-runtime-library",
    ]);
  });
});
