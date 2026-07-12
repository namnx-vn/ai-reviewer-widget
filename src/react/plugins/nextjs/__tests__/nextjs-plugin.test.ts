import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../engine/react-engine";
import { reactPlugin } from "../../react-plugin";
import { nextjsPlugin } from "..";

function analyze(source: string) {
  return new ReactEngine().analyze({
    source,
    file: "app/example/page.tsx",
    plugins: [nextjsPlugin],
  });
}

describe("nextjsPlugin", () => {
  it("is opt-in and never changes the default React plugin", () => {
    expect(reactPlugin.rules.map((rule) => rule.id)).not.toContain(
      "nextjs.app-router.client-hook-in-server-component",
    );

    expect(nextjsPlugin.id).toBe("nextjs");
  });

  it("only analyzes files that establish App Router usage", () => {
    const findings = new ReactEngine().analyze({
      source: `
        import { useState } from "react";
        export function Button() {
          const [open] = useState(false);
          return <button onClick={() => undefined}>{String(open)}</button>;
        }
      `,
      file: "src/components/Button.tsx",
      plugins: [nextjsPlugin],
    });

    expect(findings).toHaveLength(0);
  });

  it("detects React client hooks in a Server Component", () => {
    const findings = analyze(`
      import { useState } from "react";

      export default function Page() {
        const [open, setOpen] = useState(false);
        return <button onClick={() => setOpen(true)}>{String(open)}</button>;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "nextjs.app-router.client-hook-in-server-component",
    );
  });

  it("detects next/navigation hooks in a Server Component", () => {
    const findings = analyze(`
      import { useSearchParams } from "next/navigation";

      export default function Page() {
        return <div>{useSearchParams().toString()}</div>;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "nextjs.app-router.client-hook-in-server-component",
    );
  });

  it("allows React client hooks in a Client Component", () => {
    const findings = analyze(`
      "use client";
      import { useState } from "react";

      export default function Page() {
        const [open, setOpen] = useState(false);
        return <button onClick={() => setOpen(true)}>{String(open)}</button>;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("detects interactive event handlers in a Server Component", () => {
    const findings = analyze(`
      export default function Page() {
        return <button onClick={() => undefined}>Save</button>;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "nextjs.app-router.event-handler-in-server-component",
    );
  });

  it("detects server-only imports in a Client Component", () => {
    const findings = analyze(`
      "use client";
      import { cookies } from "next/headers";

      export default function Page() {
        return <div>{cookies().toString()}</div>;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "nextjs.app-router.server-import-in-client-component",
    );
  });

  it("allows erased type imports from a server-only module", () => {
    const findings = analyze(`
      "use client";
      import type { ReadonlyRequestCookies } from "next/headers";

      export default function Page({ value }: { value: ReadonlyRequestCookies }) {
        return <div>{String(value)}</div>;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("detects async Client Components", () => {
    const findings = analyze(`
      "use client";

      export default async function Page() {
        return <div />;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "nextjs.app-router.async-client-component",
    );
  });

  it("detects anonymous default async Client Components", () => {
    const findings = analyze(`
      "use client";

      export default async function () {
        return <div />;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "nextjs.app-router.async-client-component",
    );
  });

  it("requires the use client directive to be the first statement", () => {
    const findings = analyze(`
      import { useState } from "react";
      "use client";

      export default function Page() {
        const [open] = useState(false);
        return <div>{String(open)}</div>;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "nextjs.app-router.invalid-client-directive-placement",
    );
  });
});
