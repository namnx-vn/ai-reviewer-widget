import { describe, expect, it } from "vitest";

import { reactPlugin } from "../react-plugin";

describe("reactPlugin", () => {
  it("registers all React Hooks intelligence rules", () => {
    const ruleIds = reactPlugin.rules.map((rule) => rule.id);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "react.hooks.missing-deps",
        "react.hooks.stale-closure",
        "react.hooks.conditional",
        "react.hooks.invalid-order",
        "react.hooks.unnecessary-effect",
        "react.hooks.async-effect",
      ]),
    );
  });

  it("does not register duplicate rule ids", () => {
    const ruleIds = reactPlugin.rules.map((rule) => rule.id);

    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });
});