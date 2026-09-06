import { describe, expect, it } from "vitest";

import { analyzeFiles } from "../../index";
import { analyzeAST } from "../analyzer";
import {
  manifestStreamedBodyRule,
  nondeterministicSnapshotTimeRule,
  serverCacheTeardownRule,
  undefinedMethodGuardRule,
} from "../rules/ssr-resource";

describe("SSR and resource correctness rules", () => {
  it("detects server query clients disposed without cancel and clear", () => {
    const findings = analyzeAST(`
      interface QueryClient {
        mount(): void;
        unmount(): void;
        cancelQueries(): Promise<void>;
        clear(): void;
      }
      export function mountServerProvider(
        client: QueryClient,
        onCleanup: (cleanup: () => void) => void,
      ): void {
        client.mount();
        onCleanup(() => client.unmount());
      }
    `, "src/server-provider.ts", [serverCacheTeardownRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "quality.resource.server-cache-teardown",
    );
  });

  it("accepts server query clients that cancel and clear during cleanup", () => {
    const findings = analyzeAST(`
      interface QueryClient {
        mount(): void;
        unmount(): void;
        cancelQueries(): Promise<void>;
        clear(): void;
      }
      export function mountServerProvider(
        client: QueryClient,
        onCleanup: (cleanup: () => void) => void,
      ): void {
        client.mount();
        onCleanup(() => {
          void client.cancelQueries();
          client.clear();
          client.unmount();
        });
      }
    `, "src/server-provider.ts", [serverCacheTeardownRule]);

    expect(findings).toHaveLength(0);
  });

  it("detects wall-clock reads embedded in dehydration snapshots", () => {
    const findings = analyzeAST(`
      interface QueryState { readonly data: unknown }
      export function dehydrateQuery(state: QueryState) {
        return { dehydratedAt: Date.now(), state };
      }
    `, "src/dehydrate.ts", [nondeterministicSnapshotTimeRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "quality.correctness.nondeterministic-snapshot-time",
    );
  });

  it("accepts a dehydration snapshot timestamp supplied by the cache boundary", () => {
    const findings = analyzeAST(`
      interface QueryState { readonly data: unknown }
      export function dehydrateQuery(state: QueryState, snapshotTime: number) {
        return { dehydratedAt: snapshotTime, state };
      }
    `, "src/dehydrate.ts", [nondeterministicSnapshotTimeRule]);

    expect(findings).toHaveLength(0);
  });

  it("detects manifest markup emitted in streamed body metadata", () => {
    const findings = analyzeAST(`
      interface Metadata { readonly manifest?: string }
      export async function renderStreamingMetadata(metadata: Promise<Metadata>) {
        const head: readonly string[] = ["<meta charset=\\"utf-8\\">"];
        const resolved = await metadata;
        const body = resolved.manifest
          ? [\`<link rel=\\"manifest\\" href=\\"\${resolved.manifest}\\">\`]
          : [];
        return { head, body };
      }
    `, "src/metadata.ts", [manifestStreamedBodyRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "quality.web.manifest-streamed-body",
    );
  });

  it("accepts manifest markup emitted in head metadata", () => {
    const findings = analyzeAST(`
      export function renderMetadata(manifest: string) {
        const head = [\`<link rel=\\"manifest\\" href=\\"\${manifest}\\">\`];
        const body: readonly string[] = [];
        return { head, body };
      }
    `, "src/metadata.ts", [manifestStreamedBodyRule]);

    expect(findings).toHaveLength(0);
  });

  it("detects an unavailable bare identifier in a class-method guard", () => {
    const findings = analyzeAST(`
      interface Span {}
      export class Tracer {
        private isNoopTracer(): boolean { return true; }
        withSpan<T>(_span: Span, fn: () => T): T {
          if (!force && this.isNoopTracer()) return fn();
          return fn();
        }
      }
    `, "src/tracer.ts", [undefinedMethodGuardRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "quality.correctness.undefined-method-guard",
    );
  });

  it("accepts method guards backed by an explicit parameter", () => {
    const findings = analyzeAST(`
      export class Tracer {
        withSpan<T>(force: boolean, fn: () => T): T {
          if (!force) return fn();
          return fn();
        }
      }
    `, "src/tracer.ts", [undefinedMethodGuardRule]);

    expect(findings).toHaveLength(0);
  });

  it("runs all four rules through the default production composition", () => {
    const findings = analyzeFiles([
      {
        path: "src/dehydrate.ts",
        content: "export function dehydrateQuery(state: unknown) { return { dehydratedAt: Date.now(), state }; }",
      },
      {
        path: "src/metadata.ts",
        content: "export function renderMetadata(manifest: string) { const body = [`<link rel=\\\"manifest\\\" href=\\\"${manifest}\\\">`]; return { body }; }",
      },
    ]);

    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      "quality.correctness.nondeterministic-snapshot-time",
      "quality.web.manifest-streamed-body",
    ]));
  });
});
