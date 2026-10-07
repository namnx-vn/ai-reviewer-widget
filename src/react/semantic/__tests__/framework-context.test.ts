import { describe, expect, it } from "vitest";

import { resolveFrameworkContext } from "../framework-context";

describe("resolveFrameworkContext", () => {
  it("detects React without classifying a project as Next.js from app paths alone", () => {
    const context = resolveFrameworkContext({
      files: [
        packageFile({ react: "19.2.8" }),
        { path: "src/app/page.tsx", content: "export default function Page() { return <div />; }" },
      ],
    });

    expect(context.react).toEqual({
      detected: true,
      version: "19.2.8",
      minimumVersion: { major: 19, minor: 2, patch: 8 },
      compiler: "unknown",
    });
    expect(context.nextjs).toBeUndefined();
  });

  it("resolves App Router, Pages Router, and mixed router modes from Next evidence", () => {
    expect(resolveFrameworkContext({
      files: [
        packageFile({ next: "16.0.0", react: "19.2.8" }),
        { path: "app/page.tsx", content: "" },
      ],
    }).nextjs?.router).toBe("app");

    expect(resolveFrameworkContext({
      files: [
        packageFile({ next: "15.4.0", react: "19.0.0" }),
        { path: "pages/index.tsx", content: "" },
      ],
    }).nextjs?.router).toBe("pages");

    expect(resolveFrameworkContext({
      files: [
        packageFile({ next: "16.0.0", react: "19.2.8" }),
        { path: "src/app/page.tsx", content: "" },
        { path: "src/pages/index.tsx", content: "" },
      ],
    }).nextjs?.router).toBe("mixed");
  });

  it("degrades missing router evidence to unknown", () => {
    const context = resolveFrameworkContext({
      files: [packageFile({ next: "16.0.0", react: "19.2.8" })],
    });

    expect(context.nextjs).toMatchObject({
      version: "16.0.0",
      router: "unknown",
      cacheComponents: "unknown",
      runtime: "unknown",
    });
  });

  it("detects React Compiler, Cache Components, and runtime capabilities from config evidence", () => {
    const context = resolveFrameworkContext({
      files: [
        packageFile({ next: "16.0.0", react: "19.2.8" }, { "babel-plugin-react-compiler": "1.0.0" }),
        {
          path: "next.config.ts",
          content: `
            export default {
              reactCompiler: { compilationMode: "annotation" },
              cacheComponents: true,
            };
          `,
        },
        { path: "app/page.tsx", content: "export const runtime = 'edge';" },
      ],
    });

    expect(context.react.compiler).toBe("enabled");
    expect(context.nextjs?.cacheComponents).toBe(true);
    expect(context.nextjs?.runtime).toBe("edge");
  });

  it("detects explicit compiler disablement and mixed runtime declarations", () => {
    const context = resolveFrameworkContext({
      files: [
        packageFile({ next: "16.0.0", react: "19.2.8" }),
        { path: "next.config.ts", content: "export default { reactCompiler: false };" },
        { path: "app/page.tsx", content: "export const runtime = 'edge';" },
        { path: "app/api/route.ts", content: "export const runtime = 'nodejs';" },
      ],
    });

    expect(context.react.compiler).toBe("disabled");
    expect(context.nextjs?.runtime).toBe("mixed");
  });

  it("preserves an explicit Cache Components disablement", () => {
    const context = resolveFrameworkContext({
      files: [
        packageFile({ next: "16.0.0", react: "19.2.8" }),
        { path: "next.config.ts", content: "export default { cacheComponents: false };" },
      ],
    });

    expect(context.nextjs?.cacheComponents).toBe(false);
  });

  it("uses config and source imports as Next.js evidence without using paths alone", () => {
    const configContext = resolveFrameworkContext({
      files: [{ path: "next.config.mjs", content: "export default {};" }],
    });
    const sourceContext = resolveFrameworkContext({
      files: [
        {
          path: "src/app/page.tsx",
          content: 'import Image from "next/image"; export default function Page() { return <Image alt="" src="/logo.svg" />; }',
        },
      ],
    });
    const pathOnlyContext = resolveFrameworkContext({
      files: [{ path: "src/app/page.tsx", content: "export default function Page() { return <div />; }" }],
    });

    expect(configContext.nextjs).toBeDefined();
    expect(sourceContext.nextjs?.router).toBe("app");
    expect(pathOnlyContext.nextjs).toBeUndefined();
  });

  it("resolves framework evidence within the target file's nearest package boundary", () => {
    const files = [
      packageFile({ react: "^18.3.0" }),
      {
        path: "packages/dashboard/package.json",
        content: JSON.stringify({ dependencies: { next: "^16.0.0", react: "^19.2.0" } }),
      },
      { path: "packages/dashboard/src/app/page.tsx", content: "export default function Page() { return null; }" },
      {
        path: "packages/widget/package.json",
        content: JSON.stringify({ dependencies: { react: "^18.3.0" } }),
      },
      { path: "packages/widget/src/app/view.tsx", content: "export function View() { return null; }" },
    ];

    const dashboard = resolveFrameworkContext({
      files,
      targetFile: "packages/dashboard/src/app/page.tsx",
    });
    const widget = resolveFrameworkContext({
      files,
      targetFile: "packages/widget/src/app/view.tsx",
    });

    expect(dashboard.react).toMatchObject({
      version: "^19.2.0",
      minimumVersion: { major: 19, minor: 2, patch: 0 },
    });
    expect(dashboard.nextjs?.router).toBe("app");
    expect(widget.react).toMatchObject({
      version: "^18.3.0",
      minimumVersion: { major: 18, minor: 3, patch: 0 },
    });
    expect(widget.nextjs).toBeUndefined();
  });

  it("only exposes a minimum version when the dependency range has a safe lower bound", () => {
    const supportedRange = resolveFrameworkContext({
      files: [packageFile({ react: "~19.2.8", next: ">=16.1.0 <17" })],
    });
    const unsupportedRange = resolveFrameworkContext({
      files: [packageFile({ react: "latest", next: "workspace:*" })],
    });

    expect(supportedRange.react.minimumVersion).toEqual({ major: 19, minor: 2, patch: 8 });
    expect(supportedRange.nextjs?.minimumVersion).toEqual({ major: 16, minor: 1, patch: 0 });
    expect(unsupportedRange.react).toMatchObject({ version: "latest" });
    expect(unsupportedRange.react.minimumVersion).toBeUndefined();
    expect(unsupportedRange.nextjs).toMatchObject({ version: "workspace:*" });
    expect(unsupportedRange.nextjs?.minimumVersion).toBeUndefined();
  });

  it("resolves conflicting repository evidence conservatively and independently of file order", () => {
    const files = [
      packageFile({ react: "18.3.1" }),
      {
        path: "packages/app/package.json",
        content: JSON.stringify({ dependencies: { react: "19.2.0", next: "16.0.0" } }),
      },
      { path: "packages/app/next.config.ts", content: "export default { cacheComponents: true };" },
      { path: "next.config.ts", content: "export default { cacheComponents: false };" },
    ];

    const forward = resolveFrameworkContext({ files });
    const reverse = resolveFrameworkContext({ files: [...files].reverse() });

    expect(reverse).toEqual(forward);
    expect(forward.react.version).toBeUndefined();
    expect(forward.react.minimumVersion).toBeUndefined();
    expect(forward.nextjs?.cacheComponents).toBe("unknown");
  });

  it("ignores framework-like text in comments", () => {
    const context = resolveFrameworkContext({
      files: [{
        path: "src/app/page.tsx",
        content: `
          // import Image from "next/image";
          // export const runtime = "edge";
          export default function Page() { return null; }
        `,
      }],
    });

    expect(context.nextjs).toBeUndefined();
  });

  it("ignores capability-like text inside string literals", () => {
    const context = resolveFrameworkContext({
      files: [
        packageFile({ react: "19.2.8", next: "16.0.0" }),
        {
          path: "next.config.ts",
          content: `
            const note = "reactCompiler: false; cacheComponents: true";
            export default {};
          `,
        },
        {
          path: "app/page.tsx",
          content: `
            const note = "export const runtime = 'edge'";
            export default function Page() { return note; }
          `,
        },
      ],
    });

    expect(context.react.compiler).toBe("unknown");
    expect(context.nextjs?.cacheComponents).toBe("unknown");
    expect(context.nextjs?.runtime).toBe("unknown");
  });
});

function packageFile(
  dependencies: Readonly<Record<string, string>>,
  devDependencies: Readonly<Record<string, string>> = {},
) {
  return {
    path: "package.json",
    content: JSON.stringify({ dependencies, devDependencies }),
  };
}
