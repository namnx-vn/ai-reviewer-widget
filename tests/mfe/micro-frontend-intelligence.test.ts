import { describe, expect, it } from "vitest";

import { analyzeFiles } from "../../src/analyzer";

describe("Micro Frontend intelligence", () => {
  it("prevents a remote from importing host implementation code", () => {
    const findings = analyzeFiles([{
      path: "apps/remote/catalog/ProductCard.tsx",
      content: 'import { session } from "@host/shell/session";',
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.remote-imports-host",
    );
  });

  it("prevents host applications from deep-importing remote internals", () => {
    const findings = analyzeFiles([{
      path: "apps/host/shell/App.tsx",
      content: 'import ProductRow from "@remote/catalog/internal/ProductRow";',
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.remote-deep-import",
    );
  });

  it("allows host imports through a remote public contract", () => {
    const findings = analyzeFiles([{
      path: "apps/host/shell/App.tsx",
      content: 'import CatalogApp from "@remote/catalog";',
    }]);

    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "mfe.remote-deep-import",
    );
  });

  it("requires React shared by Module Federation to be singleton", () => {
    const findings = analyzeFiles([{
      path: "module-federation.config.ts",
      content: `
        export default {
          remotes: { catalog: "catalog@http://localhost:3001/remoteEntry.js" },
          shared: { react: { singleton: false } },
        };
      `,
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.module-federation.react-singleton",
    );
  });

  it("requires react-dom shared by Module Federation to be singleton", () => {
    const findings = analyzeFiles([{
      path: "module-federation.config.ts",
      content: `
        export default {
          remotes: { catalog: "catalog@http://localhost:3001/remoteEntry.js" },
          shared: { "react-dom": {} },
        };
      `,
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.module-federation.react-dom-singleton",
    );
  });

  it("accepts singleton React and react-dom Module Federation shares", () => {
    const findings = analyzeFiles([{
      path: "module-federation.config.ts",
      content: `
        export default {
          remotes: { catalog: "catalog@http://localhost:3001/remoteEntry.js" },
          shared: {
            react: { singleton: true },
            "react-dom": { singleton: true },
          },
        };
      `,
    }]);

    expect(findings.map((finding) => finding.ruleId)).not.toEqual(
      expect.arrayContaining([
        "mfe.module-federation.react-singleton",
        "mfe.module-federation.react-dom-singleton",
      ]),
    );
  });
});
