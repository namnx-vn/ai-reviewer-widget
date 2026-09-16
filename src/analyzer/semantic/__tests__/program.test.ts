import { describe, expect, it } from "vitest";
import { analyzeSemanticProgram, compareSemanticPrograms } from "../index";

describe("bounded semantic program", () => {
  it("resolves const aliases through named re-exports without source serialization", () => {
    const result = analyzeSemanticProgram([
      { path: "cache.ts", content: "export const cache = new WeakMap(); export function save(k,v) { cache.set(k,v); }" },
      { path: "barrel.ts", content: "export { save as write } from './cache';" },
      { path: "consumer.ts", content: "import { write } from './barrel'; const alias = write; export function run(k,v) { alias(k,v); }" },
    ]);
    expect(result.functions.find((item) => item.id === "consumer.ts#run")?.calls).toEqual(["cache.ts#save"]);
    expect(result.caches[0]).toMatchObject({ id: "cache.ts#cache", retention: "weak-key", writes: 1 });
    expect(JSON.stringify(result)).not.toContain("export const");
  });

  it("does not resolve shadowed function names, mutated aliases or dynamic calls", () => {
    const result = analyzeSemanticProgram([{ path: "a.ts", content: "function target() {} let alias = target; function run(target) { target(); alias(); obj[key](); }" }]);
    expect(result.functions.find((item) => item.name === "run")).toMatchObject({ calls: [], unknownCallCount: 3 });
  });

  it("does not treat shadowed Map or cache identifiers as canonical", () => {
    const result = analyzeSemanticProgram([{ path: "a.ts", content: "const Map = custom; const cache = new Map(); function run(cache) { cache.clear(); }" }]);
    expect(result.caches).toEqual([]);
  });

  it("retains closure shadows and counts imported cache operations", () => {
    const result = analyzeSemanticProgram([
      { path: "a.ts", content: "export const cache = new Map(); function outer(cache) { return () => cache.clear(); }" },
      { path: "b.ts", content: "import { cache } from './a'; function save(k,v) { cache.set(k,v); }" },
    ]);
    expect(result.caches[0]).toMatchObject({ cleanup: "not-observed", writes: 1 });
  });

  it("never converts mere size mentions or unrelated conditionals into numeric guard signals", () => {
    const result = analyzeSemanticProgram([{ path: "a.ts", content: "const cache = new Map(); function run() { if(enabled) report(cache.size); if(cache.size) report(); }" }]);
    expect(result.caches[0].sizeGuardObserved).toBe(false);
  });

  it("withholds differential classifications for incomplete snapshots", () => {
    const base = analyzeSemanticProgram([{ path: "a.ts", content: "const cache = new WeakMap();" }]);
    const head = analyzeSemanticProgram([{ path: "a.ts", content: "const cache = new Map();" }, { path: "b.ts", content: "const =" }]);
    expect(compareSemanticPrograms(base, head).changes.every((item) => item.classification === "unknown")).toBe(true);
  });

  it("records conditional cleanup as unknown and size checks only as signals", () => {
    const result = analyzeSemanticProgram([{ path: "a.ts", content: "const cache = new Map(); function save(k,v) { cache.set(k,v); if(cache.size > 10) cache.delete(k); }" }]);
    expect(result.caches[0]).toMatchObject({ retention: "strong-key", cleanup: "unknown", sizeGuardObserved: true, writes: 1 });
  });

  it("compares unchanged debt separately from weakened ownership and removed cleanup", () => {
    const base = analyzeSemanticProgram([{ path: "a.ts", content: "const cache = new WeakMap(); function reset() { cache.delete(key); }" }]);
    const head = analyzeSemanticProgram([{ path: "a.ts", content: "const cache = new Map(); function reset() {}" }]);
    expect(compareSemanticPrograms(base, head).changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: "retention", classification: "worsened" }),
      expect.objectContaining({ property: "cleanup", classification: "removed-observation" }),
    ]));
    expect(compareSemanticPrograms(head, head).changes.every((item) => item.classification === "unchanged")).toBe(true);
  });

  it("reports recursion, parse errors, unresolved imports and limits deterministically", () => {
    const result = analyzeSemanticProgram([
      { path: "a.ts", content: "import { missing } from './missing'; function recur() { recur(); missing(); }" },
      { path: "broken.ts", content: "const =" },
    ]);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["parse-error", "unresolved-import", "recursive-call"]));
    expect(analyzeSemanticProgram([{ path: "a.ts", content: "const c = new Map();" }], { maxNodes: 1 }).complete).toBe(false);
    expect(analyzeSemanticProgram([{ path: "a.ts", content: "a" }], { maxSourceCharacters: 0 }).complete).toBe(false);
  });

  it("does not select one of ambiguous star exports", () => {
    const result = analyzeSemanticProgram([
      { path: "a.ts", content: "export function save() {}" },
      { path: "b.ts", content: "export function save() {}" },
      { path: "barrel.ts", content: "export * from './a'; export * from './b';" },
      { path: "consumer.ts", content: "import { save } from './barrel'; function run() { save(); }" },
    ]);
    expect(result.functions.find((item) => item.name === "run")).toMatchObject({ calls: [], unknownCallCount: 1 });
  });

  it("does not resolve across an unexamined re-export or exhausted symbol budget", () => {
    const result = analyzeSemanticProgram([
      { path: "a.ts", content: "export function save() {}" },
      { path: "barrel.ts", content: "export * from './a'; export * from './missing';" },
      { path: "consumer.ts", content: "import { save } from './barrel'; function run() { save(); }" },
    ]);
    expect(result.functions.find((item) => item.name === "run")).toMatchObject({ calls: [], unknownCallCount: 1 });
    expect(result.complete).toBe(false);
    expect(analyzeSemanticProgram([{ path: "a.ts", content: "function a() {} function b() {}" }], { maxSymbols: 1 }).complete).toBe(false);
  });
});
