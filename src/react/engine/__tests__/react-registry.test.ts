import { describe, expect, it } from "vitest";

import { ReactRuleRegistry } from "../react-registry";

import type { ReactPlugin } from "../react-plugin";
import { reactPlugin } from "../../plugins";

const rule = {
  id: "react.test-rule",
  description: "Test rule",

  check: () => [],
};

const plugin: ReactPlugin = {
  id: "react-core",
  name: "React Core",
  version: "1.0.0",
  rules: [rule],
};

describe("ReactRuleRegistry", () => {
  it("registers a plugin", () => {
    const registry = new ReactRuleRegistry();

    registry.register(plugin);

    expect(registry.has("react-core")).toBe(true);

    expect(registry.getPlugin("react-core")).toEqual(plugin);
  });

  it("registers the built-in React plugin", () => {
    const registry = new ReactRuleRegistry();

    registry.register(reactPlugin);

    expect(registry.getRules().map((rule) => rule.id)).toEqual(
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

  it("rejects duplicate plugins", () => {
    const registry = new ReactRuleRegistry();

    registry.register(plugin);

    expect(() => registry.register(plugin)).toThrow(
      'React plugin "react-core" is already registered.',
    );
  });

  it("returns rules from registered plugins", () => {
    const registry = new ReactRuleRegistry();

    registry.register(plugin);

    expect(registry.getRules()).toHaveLength(1);

    expect(registry.getRules()[0]?.id).toBe("react.test-rule");
  });

  it("unregisters a plugin", () => {
    const registry = new ReactRuleRegistry();

    registry.register(plugin);

    expect(registry.unregister("react-core")).toBe(true);

    expect(registry.has("react-core")).toBe(false);
  });

  it("returns false when unregistering unknown plugin", () => {
    const registry = new ReactRuleRegistry();

    expect(registry.unregister("unknown")).toBe(false);
  });

  it("clears all plugins", () => {
    const registry = new ReactRuleRegistry();

    registry.register(plugin);
    registry.clear();

    expect(registry.getPlugins()).toHaveLength(0);

    expect(registry.getRules()).toHaveLength(0);
  });
});
