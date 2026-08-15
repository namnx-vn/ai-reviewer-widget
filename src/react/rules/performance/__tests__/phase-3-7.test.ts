import { describe, expect, it } from "vitest";
import { ReactEngine } from "../../../engine";
import { performancePlugin } from "../../../plugins/performance-plugin";

describe("Phase 3.7 React performance plugin", () => {
  it("exposes the Phase 3.7 React and banking rule IDs", () => {
    expect(performancePlugin.rules.map((rule) => rule.id)).toEqual(expect.arrayContaining([
      "performance.large-component",
      "performance.react.unstable-prop",
      "performance.react.expensive-render-computation",
      "performance.react.list-with-heavy-child",
      "performance.react.context-broad-rerender",
      "performance.react.repeated-derived-computation",
      "performance.bank-ui.blocking-critical-render",
      "performance.bank-ui.sequential-critical-fetch",
      "performance.bank-ui.eager-noncritical-feature",
      "performance.bank-ui.large-critical-route",
      "performance.bank-ui.duplicate-critical-request",
    ]));
  });

  it("detects heavy list-child work", () => {
    const source = `
      function Payments({ items }) {
        return <>{items.map((item) => <Row value={item.children.sort().reduce(sum)} />)}</>;
      }
    `;
    const result = new ReactEngine().analyze({
      file: "Payments.tsx",
      source,
      plugins: [performancePlugin],
    });
    expect(result.map((finding) => finding.ruleId)).toContain("performance.react.list-with-heavy-child");
  });

  it("requires explicit banking-critical configuration", () => {
    const source = `
      function PaymentConfirmation({ items }) {
        const first = items.sort();
        const second = first.reduce(sum);
        return <section><h1>Confirm</h1><div>{second}</div></section>;
      }
    `;
    const engine = new ReactEngine();
    expect(engine.analyze({ file: "PaymentConfirmation.tsx", source, plugins: [performancePlugin] })
      .map((finding) => finding.ruleId)).not.toContain("performance.bank-ui.blocking-critical-render");
    expect(engine.analyze({
      file: "PaymentConfirmation.tsx",
      source,
      plugins: [performancePlugin],
      performance: { criticalUiComponents: ["PaymentConfirmation"] },
    }).map((finding) => finding.ruleId)).toContain("performance.bank-ui.blocking-critical-render");
  });
});
