import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parsePatch,
} from "../../src/github/diff";

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
});