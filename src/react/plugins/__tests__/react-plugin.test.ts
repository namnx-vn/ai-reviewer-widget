import { describe, expect, it } from "vitest";

import { reactPlugin } from "../react-plugin";
import { ReactEngine } from "../../engine/react-engine";

describe("reactPlugin", () => {
  it("registers hooks and rendering intelligence rules", () => {
    const ruleIds = reactPlugin.rules.map((rule) => rule.id);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "react.hooks.missing-deps",
        "react.hooks.stale-closure",
        "react.hooks.conditional",
        "react.hooks.invalid-order",
        "react.hooks.unnecessary-effect",
        "react.hooks.async-effect",
        "react.rendering.callback-misuse",
        "react.rendering.key-misuse",
        "react.rendering.unnecessary-rerender",
        "react.rendering.unstable-props",
        "react.rendering.memo-misuse",
        "react.rendering.memo-boundary",
      ]),
    );
  });

  it("does not register duplicate rule ids", () => {
    const ruleIds = reactPlugin.rules.map((rule) => rule.id);

    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it("runs rendering rules through the default plugin", () => {
    const findings = new ReactEngine().analyze({
      source: "const StaticCard = memo(() => <div>static</div>);",
      file: "StaticCard.tsx",
      plugins: [reactPlugin],
    });

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.rendering.memo-misuse",
    );
  });
});
