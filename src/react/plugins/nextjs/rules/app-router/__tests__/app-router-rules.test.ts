import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../../../engine/react-engine";
import type { ReactPlugin } from "../../../../../engine/react-plugin";
import type { FrameworkContext } from "../../../../../semantic";
import {
  nextjsInvalidMetadataClientComponentRule,
  nextjsRouteHandlerRuntimeConflictRule,
} from "..";

const plugin: ReactPlugin = {
  id: "phase-8-app-router-test",
  name: "Phase 8 App Router test rules",
  version: "8.0.0",
  rules: [
    nextjsInvalidMetadataClientComponentRule,
    nextjsRouteHandlerRuntimeConflictRule,
  ],
};

const nextAppContext: FrameworkContext = {
  react: { detected: true, compiler: "unknown" },
  nextjs: {
    version: "15.5.0",
    minimumVersion: { major: 15, minor: 5, patch: 0 },
    router: "app",
    cacheComponents: "unknown",
    runtime: "unknown",
  },
};

function analyze(source: string, file: string, framework: FrameworkContext = nextAppContext) {
  return new ReactEngine().analyze({ source, file, plugins: [plugin], framework });
}

describe("Phase 8 App Router rules", () => {
  it.each([
    "export const metadata = { title: 'Account' };",
    "export async function generateMetadata() { return { title: 'Account' }; }",
  ])("rejects client metadata exports in a page", (metadataExport) => {
    const findings = analyze(`
      "use client";
      ${metadataExport}
      export default function Page() { return <main />; }
    `, "src/app/account/page.tsx");

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "next.app.invalid-metadata-client-component",
    );
  });

  it("does not assume legacy route-segment config when the capability is unknown", () => {
    const findings = analyze(`
      export const runtime = "edge";
      export const revalidate = 60;
      export async function GET() { return new Response("ok"); }
    `, "app/api/status/route.ts", {
      react: { detected: true, compiler: "unknown" },
      nextjs: {
        version: "16.0.0",
        minimumVersion: { major: 16, minor: 0, patch: 0 },
        router: "app",
        cacheComponents: "unknown",
        runtime: "edge",
      },
    });

    expect(findings).toHaveLength(0);
  });

  it("allows metadata exports in a Server Component", () => {
    const findings = analyze(`
      export const metadata = { title: "Account" };
      export default function Page() { return <main />; }
    `, "app/account/page.tsx");

    expect(findings).toHaveLength(0);
  });

  it("ignores matching filenames outside an App Router route", () => {
    const findings = analyze(`
      "use client";
      export const metadata = { title: "Account" };
      export default function Page() { return <main />; }
    `, "src/components/page.tsx");

    expect(findings).toHaveLength(0);
  });

  it("requires established Next.js App Router context", () => {
    const findings = analyze(`
      "use client";
      export const metadata = { title: "Account" };
      export default function Page() { return <main />; }
    `, "app/account/page.tsx", {
      react: { detected: true, compiler: "unknown" },
    });

    expect(findings).toHaveLength(0);
  });

  it("detects revalidation configured for an Edge Route Handler", () => {
    const findings = analyze(`
      export const runtime = "edge";
      export const revalidate = 60;
      export async function GET() { return new Response("ok"); }
    `, "app/api/status/route.ts");

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "next.app.route-handler-runtime-conflict",
    );
  });

  it.each([
    ["node runtime", 'export const runtime = "nodejs"; export const revalidate = 60;'],
    ["non-route special file", 'export const runtime = "edge"; export const revalidate = 60;'],
  ])("does not report %s", (_label, source) => {
    const file = _label === "node runtime" ? "app/api/status/route.ts" : "app/status/loading.tsx";
    expect(analyze(source, file)).toHaveLength(0);
  });
});
