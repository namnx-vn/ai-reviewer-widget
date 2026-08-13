import { describe, expect, it } from "vitest";
import type { AIProvider } from "../../ai/types";
import type { ASTRule } from "../../analyzer/ast/rules";
import { analyzeWithPlugins, createPluginRegistry } from "..";
import type { ReviewerPlugin } from "../types";

const astRule: ASTRule = {
  id: "example.no-marker",
  description: "Detect an example marker.",
  check(_node, file) {
    return file.endsWith("example.ts")
      ? [{
          id: "example-marker",
          ruleId: "example.no-marker",
          title: "Example marker",
          message: "Example plugin rule executed.",
          severity: "low",
          source: "ast",
          confidence: 1,
          location: { file },
        }]
      : [];
  },
};

const aiProvider: AIProvider = {
  name: "example-ai",
  async review() {
    return { findings: [] };
  },
};

const plugin: ReviewerPlugin = {
  id: "example",
  name: "Example",
  version: "1.0.0",
  astRules: [astRule],
  aiProviders: [aiProvider],
  analyzers: [{
    id: "example.files",
    name: "Example file analyzer",
    version: "1.0.0",
    analyze(files) {
      return {
        findings: files.length === 0
          ? []
          : [{
              id: "example-files",
              ruleId: "example.files",
              title: "Files analyzed",
              message: "Custom analyzer executed.",
              severity: "info",
              source: "architecture",
              confidence: 1,
            }],
      };
    },
  }],
};

describe("PluginRegistry", () => {
  it("registers typed plugin contributions", () => {
    const registry = createPluginRegistry([plugin]);
    const snapshot = registry.snapshot();

    expect(snapshot.plugins).toHaveLength(1);
    expect(snapshot.astRules).toEqual([astRule]);
    expect(registry.getAIProvider("example-ai")).toBe(aiProvider);
  });

  it("rejects duplicate plugin ids", () => {
    const registry = createPluginRegistry([plugin]);

    expect(() => registry.register(plugin)).toThrow(
      'Plugin "example" is already registered.',
    );
  });

  it("runs contributed AST rules and analyzers", () => {
    const result = analyzeWithPlugins(
      [{ path: "example.ts", content: "export const value = 1;" }],
      createPluginRegistry([plugin]),
    );

    expect(result.findings.some((finding) => finding.ruleId === "example.no-marker")).toBe(true);
    expect(result.findings.some((finding) => finding.ruleId === "example.files")).toBe(true);
  });
});
