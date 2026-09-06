import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../engine/react-engine";
import { reactStateModuleSharedInstanceRule } from "../module-instance-state";

function analyze(source: string) {
  return new ReactEngine().analyze({
    source,
    file: "example.tsx",
    plugins: [{
      id: "test",
      name: "test",
      version: "1",
      rules: [reactStateModuleSharedInstanceRule],
    }],
  });
}

describe("module-shared React instance state", () => {
  it("detects mutable module state mirrored into per-instance useState", () => {
    const findings = analyze(`
      import { useState } from "react";
      let sharedSelectedQueryId: string | null = null;

      export function DevtoolsInstance() {
        const [selectedQueryId, setSelectedQueryId] = useState(sharedSelectedQueryId);
        function selectQuery(id: string) {
          sharedSelectedQueryId = id;
          setSelectedQueryId(id);
        }
        return { selectedQueryId, selectQuery };
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.state.module-shared-instance-state",
    );
  });

  it("accepts state that is isolated inside each component instance", () => {
    const findings = analyze(`
      import { useState } from "react";
      export function DevtoolsInstance() {
        const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
        return { selectedQueryId, selectQuery: setSelectedQueryId };
      }
    `);

    expect(findings).toHaveLength(0);
  });
});
