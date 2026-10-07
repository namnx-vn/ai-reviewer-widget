import { describe, expect, it } from "vitest";

import { buildVerifiedFrameworkContextBlock } from "../framework-context";

describe("buildVerifiedFrameworkContextBlock", () => {
  it("deduplicates changed-file contexts and preserves unknown facts explicitly", () => {
    const block = buildVerifiedFrameworkContextBlock({
      files: [
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { react: "19.2.0" } }),
        },
        { path: "src/App.tsx", content: "export function App() { return null; }" },
        { path: "src/Other.tsx", content: "export function Other() { return null; }" },
      ],
      changedPaths: ["src/App.tsx", "src/Other.tsx"],
    });

    expect(block).toContain("VERIFIED FRAMEWORK CONTEXT");
    expect(block).toContain('"version":"19.2.0"');
    expect(block).toContain('"minimumVersion":{"major":19,"minor":2,"patch":0}');
    expect(block).toContain('"compiler":"unknown"');
    expect(block).toContain('"detected":false');
    expect(block).toContain('"router":"unknown"');
    expect(block.match(/"framework":/g)).toHaveLength(1);
  });

  it("keeps package contexts separate and reports bounded omissions", () => {
    const files = Array.from({ length: 10 }, (_, index) => [
      {
        path: `packages/p${index}/package.json`,
        content: JSON.stringify({
          dependencies: {
            react: `19.${index}.0`,
            next: `16.${index}.0`,
          },
        }),
      },
      {
        path: `packages/p${index}/app/page.tsx`,
        content: "export default function Page() { return null; }",
      },
    ]).flat();

    const block = buildVerifiedFrameworkContextBlock({
      files,
      changedPaths: files.filter((file) => file.path.endsWith("page.tsx")).map((file) => file.path),
      maximumContexts: 2,
    });

    expect(block.match(/"framework":/g)).toHaveLength(2);
    expect(block).toContain('"omittedContexts":8');
    expect(block).not.toContain("19.9.0");
  });

  it("is deterministic regardless of duplicate changed paths", () => {
    const input = {
      files: [{ path: "src/App.tsx", content: "export function App() { return null; }" }],
      changedPaths: ["src/App.tsx", "./src/App.tsx", "src/App.tsx"],
    };

    expect(buildVerifiedFrameworkContextBlock(input)).toBe(buildVerifiedFrameworkContextBlock(input));
  });
});
