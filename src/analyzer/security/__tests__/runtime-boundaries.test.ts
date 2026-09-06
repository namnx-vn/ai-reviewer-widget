import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import { SecurityAnalysisEngine } from "../engine/security-analysis-engine";
import { SecurityRuleRegistry } from "../registry/security-rule-registry";
import { createSourceSecurityRuleRegistry } from "../review-findings";
import { runtimeBoundarySecurityRules } from "../rules/runtime-boundaries";

function analyze(source: string) {
  const registry = new SecurityRuleRegistry();
  for (const rule of runtimeBoundarySecurityRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({
    source,
    file: "src/runtime.ts",
    ast: parseSource(source),
  }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("runtime boundary security", () => {
  it("publishes stable runtime-boundary rule ids", () => {
    expect(runtimeBoundarySecurityRules.map((rule) => rule.meta.id)).toEqual([
      "security.data.operational-response-exposure",
      "security.xss.csp-nonce-propagation",
      "security.xss.raw-json-script-serialization",
      "security.configuration.destructive-env-reload",
    ]);
  });

  it("registers runtime-boundary rules in the production security registry", () => {
    const registry = createSourceSecurityRuleRegistry();

    for (const rule of runtimeBoundarySecurityRules) {
      expect(registry.has(rule.meta.id)).toBe(true);
    }
  });

  it("detects a public health result that exposes process details", () => {
    expect(ruleIds(`
      interface HealthResult {
        readonly status: "healthy" | "unhealthy";
        readonly system: {
          readonly memoryUsage: NodeJS.MemoryUsage;
          readonly uptime: number;
        };
      }
      declare const monitor: { check(): Promise<HealthResult> };
      declare const NextResponse: { json(body: unknown): unknown };

      export async function GET() {
        const result = await monitor.check();
        return NextResponse.json(result);
      }
    `)).toContain("security.data.operational-response-exposure");
  });

  it("does not flag a health endpoint that returns only a public status", () => {
    expect(ruleIds(`
      interface HealthResult {
        readonly status: "healthy" | "unhealthy";
        readonly system: {
          readonly memoryUsage: NodeJS.MemoryUsage;
          readonly uptime: number;
        };
      }
      declare const monitor: { check(): Promise<HealthResult> };
      declare const NextResponse: { json(body: unknown): unknown };

      export async function GET() {
        const result = await monitor.check();
        return NextResponse.json({ status: result.status });
      }
    `)).not.toContain("security.data.operational-response-exposure");
  });

  it("detects direct JSON.stringify interpolation inside a script element", () => {
    expect(ruleIds(`
      export function renderState(state: unknown) {
        return \`<script>window.__STATE__ = \${JSON.stringify(state)}</script>\`;
      }
    `)).toContain("security.xss.raw-json-script-serialization");
  });

  it("accepts JSON serialization that escapes script-breaking characters", () => {
    expect(ruleIds(`
      export function renderState(state: unknown) {
        const serialized = JSON.stringify(state).replace(/</g, "\\\\u003c");
        return \`<script>window.__STATE__ = \${serialized}</script>\`;
      }
    `)).not.toContain("security.xss.raw-json-script-serialization");
  });

  it("detects script descriptors that omit an available CSP nonce", () => {
    expect(ruleIds(`
      interface RenderContext { readonly nonce?: string }
      export function createBoundaryScript(context: RenderContext, src: string) {
        return { src, async: true, key: \`boundary-\${src}\` };
      }
    `)).toContain("security.xss.csp-nonce-propagation");
  });

  it("detects render calls that drop a nonce-capable context", () => {
    expect(ruleIds(`
      interface RenderOptions { readonly nonce?: string; readonly element: unknown }
      declare function renderToStream(options: {
        readonly element: unknown;
        readonly streamOptions?: { readonly nonce?: string };
      }): unknown;

      export function renderPage(options: RenderOptions) {
        return renderToStream({ element: options.element });
      }
    `)).toContain("security.xss.csp-nonce-propagation");
  });

  it("accepts script and render paths that propagate the nonce", () => {
    expect(ruleIds(`
      interface RenderOptions { readonly nonce?: string; readonly element: unknown }
      export function createBoundaryScript(options: RenderOptions, src: string) {
        return { src, async: true, nonce: options.nonce };
      }
      declare function renderToStream(options: {
        readonly element: unknown;
        readonly streamOptions?: { readonly nonce?: string };
      }): unknown;
      export function renderPage(options: RenderOptions) {
        return renderToStream({
          element: options.element,
          streamOptions: { nonce: options.nonce },
        });
      }
    `)).not.toContain("security.xss.csp-nonce-propagation");
  });

  it("detects environment replacement before the replacement dotenv read", () => {
    expect(ruleIds(`
      type Env = Readonly<Record<string, string | undefined>>;
      declare function replaceProcessEnv(env: Env): void;
      declare function readDotEnvFiles(): readonly string[];

      export function forceReloadEnv(initialEnv: Env) {
        replaceProcessEnv(initialEnv);
        return readDotEnvFiles();
      }
    `)).toContain("security.configuration.destructive-env-reload");
  });

  it("accepts environment replacement after the reload data is read", () => {
    expect(ruleIds(`
      type Env = Readonly<Record<string, string | undefined>>;
      declare function replaceProcessEnv(env: Env): void;
      declare function readDotEnvFiles(): readonly string[];

      export function forceReloadEnv(initialEnv: Env) {
        const files = readDotEnvFiles();
        replaceProcessEnv(initialEnv);
        return files;
      }
    `)).not.toContain("security.configuration.destructive-env-reload");
  });
});
