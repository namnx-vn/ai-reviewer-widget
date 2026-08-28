import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import {
  dedupeSteps,
  orderKinds,
} from "../flow/taint-evidence";
import type { TaintStep } from "../flow/types";
import { buildModelState } from "../rules/browser/browser-state";

describe("decomposed security model stages", () => {
  it("collects browser globals, imports, aliases, and message bindings", () => {
    const state = buildModelState(parseSource(`
      import DOMPurify from "dompurify";
      const browserWindow = window;
      window.addEventListener("message", (messageEvent) => {
        console.log(messageEvent.data);
      });
    `));

    expect(state.namespaces.get("DOMPurify")).toBe("dompurify");
    expect(state.callables.get("DOMPurify")).toEqual({
      module: "dompurify",
      imported: "default",
    });
    expect(state.globalAliases.get("browserWindow")).toBe("window");
    expect(state.messageBindings).toEqual(new Set(["messageEvent"]));
  });

  it("keeps taint kind and evidence ordering deterministic", () => {
    const step: TaintStep = {
      kind: "source",
      label: "Request input",
      sourceKind: "request-input",
    };

    expect(orderKinds(["path", "command", "path", "sql"])).toEqual([
      "command",
      "sql",
      "path",
    ]);
    expect(dedupeSteps([step, step])).toEqual([step]);
  });
});
