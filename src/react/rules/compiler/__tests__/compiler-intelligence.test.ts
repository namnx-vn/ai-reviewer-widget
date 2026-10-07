import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../engine/react-engine";
import { reactPlugin } from "../../../plugins/react-plugin";
import type {
  FrameworkContext,
  FrameworkTriState,
} from "../../../semantic/framework-context";

function framework(compiler: FrameworkTriState): FrameworkContext {
  return {
    react: {
      detected: true,
      version: "19.2.0",
      compiler,
    },
  };
}

function analyze(source: string, compiler: FrameworkTriState) {
  return new ReactEngine().analyze({
    source,
    file: "example.tsx",
    plugins: [reactPlugin],
    framework: framework(compiler),
  });
}

describe("React Compiler intelligence", () => {
  it("reports a component input property mutated during render when the compiler is enabled", () => {
    const findings = analyze(`
      function Profile({ user }) {
        user.name = user.name.trim();
        return <span>{user.name}</span>;
      }
    `, "enabled");

    const compilerFindings = findings.filter((finding) =>
      finding.ruleId === "react.compiler.input-mutation"
    );

    expect(compilerFindings).toHaveLength(1);
    expect(compilerFindings[0]?.message).toContain("React Compiler is enabled");
  });

  it("reports a mutating array method on a component input during render", () => {
    const findings = analyze(`
      function List({ items }) {
        items.sort((left, right) => left.rank - right.rank);
        return <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
      }
    `, "enabled");

    expect(findings.filter((finding) =>
      finding.ruleId === "react.compiler.input-mutation"
    )).toHaveLength(1);
  });

  it("does not report mutation of a local value", () => {
    const findings = analyze(`
      function List({ items }) {
        const visible = [...items];
        visible.sort((left, right) => left.rank - right.rank);
        return <ul>{visible.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
      }
    `, "enabled");

    expect(findings.some((finding) =>
      finding.ruleId === "react.compiler.input-mutation"
    )).toBe(false);
  });

  it("does not classify mutation inside an event handler as render-time mutation", () => {
    const findings = analyze(`
      function SortButton({ items }) {
        const handleClick = () => items.sort();
        return <button onClick={handleClick}>Sort</button>;
      }
    `, "enabled");

    expect(findings.some((finding) =>
      finding.ruleId === "react.compiler.input-mutation"
    )).toBe(false);
  });

  it.each(["disabled", "unknown"] as const)(
    "does not issue compiler-specific guidance when compiler state is %s",
    (compiler) => {
      const findings = analyze(`
        function Profile({ user }) {
          user.name = "updated";
          return <span>{user.name}</span>;
        }
      `, compiler);

      expect(findings.some((finding) =>
        finding.ruleId === "react.compiler.input-mutation"
      )).toBe(false);
    },
  );

  it("does not infer React capability from compiler configuration alone", () => {
    const findings = new ReactEngine().analyze({
      source: `
        function Profile({ user }) {
          user.name = "updated";
          return <span>{user.name}</span>;
        }
      `,
      file: "example.tsx",
      plugins: [reactPlugin],
      framework: {
        react: {
          detected: false,
          compiler: "enabled",
        },
      },
    });

    expect(findings.some((finding) =>
      finding.ruleId === "react.compiler.input-mutation"
    )).toBe(false);
  });
});
