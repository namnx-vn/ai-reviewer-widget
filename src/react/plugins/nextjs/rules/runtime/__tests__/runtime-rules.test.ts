import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../../../engine/react-engine";
import type { ReactPlugin } from "../../../../../engine/react-plugin";
import type { FrameworkContext } from "../../../../../semantic";
import { nextjsNodeImportInEdgeRuntimeRule } from "..";

const plugin: ReactPlugin = {
  id: "phase-8-runtime-test",
  name: "Phase 8 runtime test rules",
  version: "8.0.0",
  rules: [nextjsNodeImportInEdgeRuntimeRule],
};
const framework: FrameworkContext = {
  react: { detected: true, compiler: "unknown" },
  nextjs: { router: "app", cacheComponents: "unknown", runtime: "edge" },
};

function analyze(source: string, file = "app/api/report/route.ts") {
  return new ReactEngine().analyze({ source, file, plugins: [plugin], framework });
}

describe("nextjsNodeImportInEdgeRuntimeRule", () => {
  it.each(["node:fs", "fs", "node:crypto", "child_process"])(
    "detects %s in an explicitly Edge special file",
    (moduleName) => {
      const findings = analyze(`
        import { value } from "${moduleName}";
        export const runtime = "edge";
        export function GET() { return Response.json({ value }); }
      `);

      expect(findings.map((finding) => finding.ruleId)).toContain(
        "next.runtime.node-import-in-edge",
      );
    },
  );

  it("allows erased type-only Node imports", () => {
    const findings = analyze(`
      import type { Stats } from "node:fs";
      export const runtime = "edge";
      export function GET() { return new Response("ok"); }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not rely on project-wide Edge context without a local declaration", () => {
    const findings = analyze(`
      import { readFile } from "node:fs/promises";
      export function GET() { return Response.json({ readFile }); }
    `);

    expect(findings).toHaveLength(0);
  });

  it("allows Node imports in an explicitly Node.js route", () => {
    const findings = analyze(`
      import { readFile } from "node:fs/promises";
      export const runtime = "nodejs";
      export function GET() { return Response.json({ readFile }); }
    `);

    expect(findings).toHaveLength(0);
  });

  it("ignores ordinary files even when they declare an Edge constant", () => {
    const findings = analyze(`
      import { readFile } from "node:fs/promises";
      export const runtime = "edge";
      export { readFile };
    `, "src/app/lib/runtime.ts");

    expect(findings).toHaveLength(0);
  });
});
