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

  it("flags shared mutable state imported across application boundaries", () => {
    const findings = analyzeFiles([{
      path: "apps/remote/catalog/ProductCard.tsx",
      content: 'import { cartStore } from "@shared/state/cart";',
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.shared-state-cross-boundary",
    );
  });

  it("allows shared UI contracts across application boundaries", () => {
    const findings = analyzeFiles([{
      path: "apps/remote/catalog/ProductCard.tsx",
      content: 'import { Button } from "@shared/ui";',
    }]);

    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "mfe.shared-state-cross-boundary",
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

  it("requires array-based React shares to move to singleton configuration", () => {
    const findings = analyzeFiles([{
      path: "module-federation.config.ts",
      content: `
        export default {
          remotes: { catalog: "catalog@http://localhost:3001/remoteEntry.js" },
          shared: ["react"],
        };
      `,
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.module-federation.react-singleton",
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

  it("detects incompatible React and react-dom shared versions", () => {
    const findings = analyzeFiles([{
      path: "module-federation.config.ts",
      content: `
        export default {
          remotes: { catalog: "catalog@http://localhost:3001/remoteEntry.js" },
          shared: {
            react: { singleton: true, requiredVersion: "^18.3.1" },
            "react-dom": { singleton: true, requiredVersion: "^17.0.2" },
          },
        };
      `,
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.module-federation.react-version-mismatch",
    );
  });

  it("detects shared React version drift between host and remote configs", () => {
    const findings = analyzeFiles([
      {
        path: "apps/host/module-federation.config.ts",
        content: `
          export default {
            remotes: { catalog: "catalog@http://localhost:3001/remoteEntry.js" },
            shared: { react: { singleton: true, requiredVersion: "^18.3.1" } },
          };
        `,
      },
      {
        path: "apps/remote/catalog/module-federation.config.ts",
        content: `
          export default {
            name: "catalog",
            exposes: { ".": "./src/index.ts" },
            shared: { react: { singleton: true, requiredVersion: "^17.0.2" } },
          };
        `,
      },
    ]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.module-federation.shared-version-drift",
    );
  });

  it("flags insecure production remote entry URLs", () => {
    const findings = analyzeFiles([{
      path: "module-federation.config.ts",
      content: `
        export default {
          remotes: { catalog: "catalog@http://cdn.example.com/remoteEntry.js" },
          shared: { react: { singleton: true } },
        };
      `,
    }]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "mfe.module-federation.insecure-remote-url",
    );
  });

  it("allows localhost remote entry URLs for development configs", () => {
    const findings = analyzeFiles([{
      path: "module-federation.config.ts",
      content: `
        export default {
          remotes: { catalog: "catalog@http://localhost:3001/remoteEntry.js" },
          shared: { react: { singleton: true } },
        };
      `,
    }]);

    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "mfe.module-federation.insecure-remote-url",
    );
  });
});
