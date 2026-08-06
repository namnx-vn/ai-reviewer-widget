import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ReactEngine,
} from "../react-engine";

import type {
  ReactPlugin,
} from "../react-plugin";

describe("ReactEngine", () => {
  it("runs registered React rules against the AST", () => {
    const check = vi.fn(() => []);

    const plugin: ReactPlugin = {
      id: "test",
      name: "Test",
      version: "1.0.0",
      rules: [
        {
          id: "react.test",
          description: "Test rule",
          check,
        },
      ],
    };

    const engine =
      new ReactEngine();

    engine.analyze({
      source: `
        function Component() {
          return <div>Hello</div>;
        }
      `,
      file: "Component.tsx",
      plugins: [plugin],
    });

    expect(check).toHaveBeenCalled();
  });

  it("returns findings produced by rules", () => {
    const plugin: ReactPlugin = {
      id: "test",
      name: "Test",
      version: "1.0.0",
      rules: [
        {
          id: "react.test",
          description: "Test rule",

          check: (_node, context) => [
            {
              id: "react.test:Component.tsx:1",
              ruleId: "react.test",
              title: "Test finding",
              message: "Test message",
              severity: "low",
              source: "ast",
              confidence: 1,
              location: {
                file: context.file,
                line: 1,
              },
              suggestion:
                "Fix the test finding.",
            },
          ],
        },
      ],
    };

    const engine =
      new ReactEngine();

    const findings =
      engine.analyze({
        source: `
          function Component() {
            return <div />;
          }
        `,
        file: "Component.tsx",
        plugins: [plugin],
      });

    expect(findings.length).toBeGreaterThan(0);

    expect(
      findings[0]?.ruleId,
    ).toBe("react.test");

    expect(
      findings[0]?.confidence,
    ).toBe(1);
  });

  it("supports multiple plugins", () => {
    const calls: string[] = [];

    const plugins: ReactPlugin[] = [
      {
        id: "plugin-one",
        name: "Plugin One",
        version: "1.0.0",
        rules: [
          {
            id: "react.one",
            description: "Rule one",

            check: () => {
              calls.push("one");
              return [];
            },
          },
        ],
      },
      {
        id: "plugin-two",
        name: "Plugin Two",
        version: "1.0.0",
        rules: [
          {
            id: "react.two",
            description: "Rule two",

            check: () => {
              calls.push("two");
              return [];
            },
          },
        ],
      },
    ];

    const engine =
      new ReactEngine();

    engine.analyze({
      source: "const value = 1;",
      file: "example.ts",
      plugins,
    });

    expect(
      calls.includes("one"),
    ).toBe(true);

    expect(
      calls.includes("two"),
    ).toBe(true);
  });

  it("does not crash when a rule throws", () => {
    const plugin: ReactPlugin = {
      id: "broken",
      name: "Broken",
      version: "1.0.0",
      rules: [
        {
          id: "react.broken",
          description: "Broken rule",

          check: () => {
            throw new Error(
              "Unexpected failure",
            );
          },
        },
      ],
    };

    const engine =
      new ReactEngine();

    expect(() =>
      engine.analyze({
        source: "const value = 1;",
        file: "example.ts",
        plugins: [plugin],
      }),
    ).not.toThrow();
  });

  it("surfaces rule failures once as sanitized review warnings", () => {
    const plugin: ReactPlugin = {
      id: "mixed",
      name: "Mixed",
      version: "1.0.0",
      rules: [
        {
          id: "react.broken",
          description: "Broken rule",
          check: () => {
            throw new Error("provider-token=do-not-expose");
          },
        },
        {
          id: "react.healthy",
          description: "Healthy rule",
          check: (_node, context) => [{
            id: "react.healthy:Component.tsx:1",
            ruleId: "react.healthy",
            title: "Healthy finding",
            message: "Healthy rule still runs.",
            severity: "low",
            source: "ast",
            confidence: 1,
            location: { file: context.file, line: 1 },
          }],
        },
      ],
    };

    const result = new ReactEngine().analyzeWithWarnings({
      source: "export function Component() { return <div />; }",
      file: "Component.tsx",
      plugins: [plugin],
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "react.healthy",
    ]);
    expect(result.warnings).toEqual([{
      code: "REACT_RULE_FAILED",
      message: expect.stringContaining("react.broken"),
    }]);
    expect(result.warnings[0]?.message).toContain("Component.tsx");
    expect(result.warnings[0]?.message).not.toContain("do-not-expose");
  });

  it("returns no React findings when the source cannot be parsed", () => {
    const engine = new ReactEngine();

    expect(() => engine.analyze({
      source: "export function Broken() { return <div>; }",
      file: "Broken.tsx",
      plugins: [],
    })).not.toThrow();

    expect(engine.analyze({
      source: "export function Broken() { return <div>; }",
      file: "Broken.tsx",
      plugins: [],
    })).toEqual([]);
  });

  it("deduplicates repeated findings by their stable id", () => {
    const plugin: ReactPlugin = {
      id: "duplicate-findings",
      name: "Duplicate findings",
      version: "1.0.0",
      rules: [{
        id: "react.duplicate",
        description: "Emits the same finding for each node.",
        check: () => [{
          id: "react.duplicate:example.tsx:1:0",
          ruleId: "react.duplicate",
          title: "Duplicate finding",
          message: "This finding must appear once.",
          severity: "low",
          source: "ast",
          confidence: 1,
          location: { file: "example.tsx", line: 1, column: 0 },
        }],
      }],
    };

    const findings = new ReactEngine().analyze({
      source: "export function Component() { return <div />; }",
      file: "example.tsx",
      plugins: [plugin],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("react.duplicate:example.tsx:1:0");
  });

  it("ignores malformed plugin output without dropping healthy findings", () => {
    const malformedCheck = vi.fn();
    malformedCheck.mockReturnValue(undefined);

    const plugin: ReactPlugin = {
      id: "mixed-output",
      name: "Mixed output",
      version: "1.0.0",
      rules: [
        {
          id: "react.healthy",
          description: "Produces a valid finding.",
          check: (_node, context) => [{
            id: "react.healthy:example.tsx:1:0",
            ruleId: "react.healthy",
            title: "Healthy finding",
            message: "This result must be preserved.",
            severity: "low",
            source: "ast",
            confidence: 1,
            location: { file: context.file, line: 1, column: 0 },
          }],
        },
        {
          id: "react.malformed",
          description: "Produces malformed runtime output.",
          check: malformedCheck,
        },
      ],
    };

    const findings = new ReactEngine().analyze({
      source: "export function Component() { return <div />; }",
      file: "example.tsx",
      plugins: [plugin],
    });

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "react.healthy",
    ]);
  });

  it("does not mutate the input plugins", () => {
    const plugins: ReactPlugin[] = [
      {
        id: "test",
        name: "Test",
        version: "1.0.0",
        rules: [],
      },
    ];

    const snapshot =
      [...plugins];

    const engine =
      new ReactEngine();

    engine.analyze({
      source: "const value = 1;",
      file: "example.ts",
      plugins,
    });

    expect(plugins).toEqual(
      snapshot,
    );
  });
});
