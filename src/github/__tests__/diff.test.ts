import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getChangedLines,
  parsePatch,
} from "../diff";
import { filterFindingsForChangedLines } from "../comments";

describe("parsePatch", () => {
  it("parses git hunk metadata", () => {
    const patch = `
@@ -10,4 +10,6 @@
 export function App() {
+  console.log("hello");
+
   return <div />;
 }
`;

    const result =
      parsePatch(
        "src/App.tsx",
        patch,
      );

    expect(result).toHaveLength(1);

    expect(
      result[0].newStart,
    ).toBe(10);

    expect(
      result[0].newLines,
    ).toBe(6);
  });

  it("tracks only added new-file lines", () => {
    const changedLines = getChangedLines(`@@ -2,2 +2,3 @@
 unchanged
-removed
+added
 retained`);

    expect([...changedLines]).toEqual([3]);
  });

  it("keeps inline findings only when they point at changed lines", () => {
    const findings = filterFindingsForChangedLines([
      { id: "changed", ruleId: "test", title: "Changed", message: "", severity: "low", source: "ast", confidence: 1, location: { file: "src/App.tsx", line: 3 } },
      { id: "old", ruleId: "test", title: "Old", message: "", severity: "low", source: "ast", confidence: 1, location: { file: "src/App.tsx", line: 2 } },
    ], new Map([["src/App.tsx", new Set([3])]]));

    expect(findings.map((finding) => finding.id)).toEqual(["changed"]);
  });
});
