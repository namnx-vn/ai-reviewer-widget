import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import {
  SecurityAnalysisEngine,
  SecurityRuleRegistry,
  dangerousExecutionRules,
} from "..";

function analyze(source: string, file = "src/example.ts") {
  const registry = new SecurityRuleRegistry();
  for (const rule of dangerousExecutionRules) registry.register(rule);

  return new SecurityAnalysisEngine().analyze({
    source,
    file,
    ast: parseSource(source),
  }, registry);
}

describe("dangerous execution rules", () => {
  it("detects direct and member eval calls", () => {
    const findings = analyze(`
      eval(input);
      globalThis.eval(input);
      window["eval"](input);
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.execution.no-eval",
      "security.execution.no-eval",
      "security.execution.no-eval",
    ]);
  });

  it("detects obvious indirect eval forms and aliases", () => {
    const findings = analyze(`
      const execute = eval;
      execute(input);
      (0, eval)(input);
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.execution.no-indirect-eval",
      "security.execution.no-indirect-eval",
    ]);
  });

  it("detects Function constructor call and new-expression forms", () => {
    const findings = analyze(`
      Function("return value")();
      new Function("value", "return value + 1");
      new globalThis.Function("return 1");
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.execution.no-new-function",
      "security.execution.no-new-function",
      "security.execution.no-new-function",
    ]);
  });

  it("detects string timer execution but ignores callback timers", () => {
    const findings = analyze(`
      setTimeout("runDangerousCode()", 10);
      window.setInterval("runDangerousCode()", 1000);
      setTimeout(() => runSafeCallback(), 10);
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.execution.no-dynamic-code",
      "security.execution.no-dynamic-code",
    ]);
  });

  it("detects modeled node vm namespace and named imports", () => {
    const findings = analyze(`
      import * as vm from "node:vm";
      import { runInNewContext as run } from "vm";
      vm.runInThisContext(source);
      run(source);
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.execution.no-vm-execution",
      "security.execution.no-vm-execution",
    ]);
  });

  it("detects aliases for Function and vm execution APIs", () => {
    const findings = analyze(`
      import * as vm from "node:vm";
      const DynamicFunction = globalThis.Function;
      const executeVm = vm.runInNewContext;
      new DynamicFunction(source);
      executeVm(source);
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.execution.no-new-function",
      "security.execution.no-vm-execution",
    ]);
  });

  it("does not flag unrelated identifiers, strings, or object methods", () => {
    const findings = analyze(`
      const text = "eval(input)";
      evaluate(input);
      sandbox.eval(input);
      utility.Function(input);
      vmLike.runInNewContext(input);
    `);

    expect(findings).toEqual([]);
  });

  it("suppresses shadowed dangerous globals", () => {
    const findings = analyze(`
      function example(eval: (value: string) => void, Function: (value: string) => void) {
        eval(input);
        Function(input);
      }
      const setTimeout = (callback: string) => callback;
      setTimeout("not code", 10);
    `);

    expect(findings).toEqual([]);
  });

  it("supports multiline TypeScript and JSX modules", () => {
    const findings = analyze(`
      export function Widget(props: { code: string }) {
        globalThis.eval(
          props.code,
        );
        return <div>{props.code}</div>;
      }
    `, "src/Widget.tsx");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.location.path).toBe("src/Widget.tsx");
    expect(findings[0]?.location.range).toBeDefined();
    expect(findings[0]?.confidence).toBe("high");
  });

  it("creates deterministic finding IDs", () => {
    const source = "globalThis.eval(input);";
    expect(analyze(source)[0]?.id).toBe(analyze(source)[0]?.id);
  });
});
