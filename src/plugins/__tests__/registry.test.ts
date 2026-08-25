import { describe, expect, it } from "vitest";
import type { AIProvider } from "../../ai/types";
import type { ASTRule } from "../../analyzer/ast/rules";
import { analyzeFilesWithWarnings } from "../../analyzer";
import type { ReactPlugin } from "../../react/engine";
import type { ReviewOutputAdapter } from "../types";
import {
  analyzeWithPlugins,
  createPluginRegistry,
  createPluginReviewUseCases,
} from "..";
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

const reactContribution: ReactPlugin = {
  id: "example.react",
  name: "Example React",
  version: "1.0.0",
  rules: [{
    id: "example.react.program",
    description: "Proves contributed React rules execute.",
    check(node, context) {
      return node.type === "Program"
        ? [{
            id: "example-react-program",
            ruleId: "example.react.program",
            title: "React contribution",
            message: "Contributed React rule executed.",
            severity: "info",
            source: "ast",
            confidence: 1,
            location: { file: context.file },
          }]
        : [];
    },
  }],
};

const outputAdapter: ReviewOutputAdapter = {
  id: "example.output",
  name: "Example output",
  version: "1.0.0",
  render: (result) => `${result.decision}:${result.findings.length}`,
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
  reactPlugins: [reactContribution],
  outputAdapters: [outputAdapter],
};

describe("PluginRegistry", () => {
  it("registers typed plugin contributions", () => {
    const registry = createPluginRegistry([plugin]);
    const snapshot = registry.snapshot();

    expect(snapshot.plugins).toHaveLength(1);
    expect(snapshot.astRules).toEqual([astRule]);
    expect(snapshot.reactPlugins).toEqual([reactContribution]);
    expect(registry.getAIProvider("example-ai")).toBe(aiProvider);
    expect(registry.getOutputAdapter("example.output")).toBe(outputAdapter);
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

  it("runs contributed React rules after contributed analyzers", () => {
    const result = analyzeWithPlugins(
      [{ path: "Example.tsx", content: "export function Example() { return <div />; }" }],
      createPluginRegistry([plugin]),
    );
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain("example.react.program");
    expect(ruleIds.indexOf("example.files")).toBeLessThan(
      ruleIds.indexOf("example.react.program"),
    );
  });

  it("rejects contribution id collisions across registered plugins before analysis", () => {
    const duplicateProviderPlugin: ReviewerPlugin = {
      id: "duplicate-provider",
      name: "Duplicate provider",
      version: "1.0.0",
      aiProviders: [aiProvider],
    };
    const registry = createPluginRegistry([plugin, duplicateProviderPlugin]);

    expect(() => registry.snapshot()).toThrow(
      'Plugin contribution "example-ai" is registered more than once.',
    );
  });

  it("runs plugin contributions through the shared application review pipeline", () => {
    const result = createPluginReviewUseCases(createPluginRegistry([plugin])).reviewFiles([
      { path: "example.ts", content: "export const value = 1;" },
    ]);

    const ruleIds = result.findings.map((finding) => finding.ruleId);
    expect(ruleIds).toContain("example.no-marker");
    expect(ruleIds.at(-1)).toBe("example.files");
  });

  it("preserves core output and appends contributed findings in registration order", () => {
    const secondPlugin: ReviewerPlugin = {
      id: "second",
      name: "Second",
      version: "1.0.0",
      analyzers: [{
        id: "second.files",
        name: "Second file analyzer",
        version: "1.0.0",
        analyze() {
          return {
            findings: [{
              id: "second-files",
              ruleId: "second.files",
              title: "Second analyzer",
              message: "Second analyzer executed.",
              severity: "info",
              source: "architecture",
              confidence: 1,
            }],
          };
        },
      }],
    };

    const result = analyzeWithPlugins(
      [{ path: "example.ts", content: 'eval("input");' }],
      createPluginRegistry([plugin, secondPlugin]),
    );
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain("security.no-eval");
    expect(ruleIds.indexOf("security.no-eval")).toBeLessThan(
      ruleIds.indexOf("example.files"),
    );
    expect(ruleIds.slice(-2)).toEqual(["example.files", "second.files"]);
  });

  it("propagates analyzer warnings without discarding core findings", () => {
    const warningPlugin: ReviewerPlugin = {
      id: "warning",
      name: "Warning",
      version: "1.0.0",
      analyzers: [{
        id: "warning.files",
        name: "Warning analyzer",
        version: "1.0.0",
        analyze() {
          return {
            findings: [],
            warnings: [{
              code: "SECURITY_RULE_FAILED",
              message: "Contributed analyzer reported a recoverable failure.",
            }],
          };
        },
      }],
    };

    const result = analyzeWithPlugins(
      [{ path: "example.ts", content: 'eval("input");' }],
      createPluginRegistry([warningPlugin]),
    );

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.no-eval" }),
    ]));
    expect(result.warnings).toEqual([{
      code: "SECURITY_RULE_FAILED",
      message: "Contributed analyzer reported a recoverable failure.",
    }]);
  });

  it("isolates a throwing analyzer without discarding core or later plugin findings", () => {
    const throwingPlugin: ReviewerPlugin = {
      id: "throwing",
      name: "Throwing",
      version: "1.0.0",
      analyzers: [{
        id: "throwing.files",
        name: "Throwing file analyzer",
        version: "1.0.0",
        analyze() {
          throw new Error("must remain private");
        },
      }],
    };

    const result = analyzeWithPlugins(
      [{ path: "example.ts", content: 'eval("input");' }],
      createPluginRegistry([throwingPlugin, plugin]),
    );

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.no-eval" }),
      expect.objectContaining({ ruleId: "example.files" }),
    ]));
    expect(result.warnings).toEqual([{
      code: "ANALYZER_CONTRIBUTION_FAILED",
      message: 'Analyzer contribution "throwing.files" failed.',
    }]);
  });

  it("matches core analysis when no plugins are registered", () => {
    const files = [{ path: "example.ts", content: 'eval("input");' }];
    const result = analyzeWithPlugins(files, createPluginRegistry());

    expect(result).toEqual(analyzeFilesWithWarnings(files));
  });
});
