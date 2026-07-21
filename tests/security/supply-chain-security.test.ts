import { describe, expect, it } from "vitest";

import {
  analyzeSupplyChain,
  type SupplyChainRepository,
} from "../../src/analyzer/security/supply-chain";

function repository(overrides: Partial<SupplyChainRepository> = {}): SupplyChainRepository {
  return {
    manifests: [{
      path: "package.json",
      dependencies: { "safe-package": "1.2.3" },
    }],
    lockfiles: [{ path: "package-lock.json", format: "npm" }],
    sourceFiles: [],
    ...overrides,
  };
}

describe("phase 3.6.15 supply-chain security", () => {
  it("detects git and http dependency sources without disclosing dependency values", () => {
    const findings = analyzeSupplyChain(repository({ manifests: [{
      path: "packages/app/package.json",
      dependencies: {
        "git-package": "git+https://github.com/example/package.git#main",
        "http-package": "http://registry.example.test/package.tgz",
      },
    }] }));

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.supply-chain.git-dependency",
      "security.supply-chain.http-dependency",
    ]);
    expect(findings.every((finding) => !finding.message.includes("github.com"))).toBe(true);
  });

  it("flags lifecycle scripts but accepts ordinary package scripts", () => {
    const unsafe = analyzeSupplyChain(repository({ manifests: [{
      path: "package.json",
      scripts: { preinstall: "node bootstrap.js", build: "tsc -b" },
    }] }));
    const safe = analyzeSupplyChain(repository({ manifests: [{
      path: "package.json",
      scripts: { build: "tsc -b", test: "vitest run" },
    }] }));
    expect(unsafe.map((finding) => finding.ruleId)).toContain("security.supply-chain.install-script");
    expect(safe.map((finding) => finding.ruleId)).not.toContain("security.supply-chain.install-script");
  });

  it("detects non-literal CommonJS require and dynamic import but accepts literal modules", () => {
    const findings = analyzeSupplyChain(repository({ sourceFiles: [{
      path: "src/load.ts",
      source: `const first = require(moduleName); const second = import(path); require("safe-package"); import("safe-package");`,
    }] }));
    expect(findings.filter((finding) => finding.ruleId === "security.supply-chain.dynamic-require")).toHaveLength(2);
  });

  it("requires a lockfile for every manifest workspace in deterministic path order", () => {
    const findings = analyzeSupplyChain(repository({
      manifests: [
        { path: "packages/z/package.json" },
        { path: "packages/a/package.json" },
      ],
      lockfiles: [],
    }));
    expect(findings.map((finding) => finding.location.path)).toEqual([
      "packages/a/package.json",
      "packages/z/package.json",
    ]);
    expect(findings.every((finding) => finding.ruleId === "security.supply-chain.lockfile-missing")).toBe(true);
  });

  it("flags unpinned configured critical sources while accepting exact versions", () => {
    const findings = analyzeSupplyChain(repository({
      criticalSources: ["payments-sdk", "audit-sdk"],
      manifests: [{ path: "package.json", dependencies: {
        "payments-sdk": "^2.4.0",
        "audit-sdk": "1.5.2",
      } }],
    }));
    expect(findings.map((finding) => finding.ruleId)).toContain("security.supply-chain.unpinned-critical-source");
    expect(findings).toHaveLength(1);
  });

  it("returns stable IDs and ordering for a monorepo scan", () => {
    const input = repository({
      manifests: [
        { path: "packages/b/package.json", dependencies: { b: "http://example.test/b.tgz" } },
        { path: "packages/a/package.json", dependencies: { a: "git+https://example.test/a.git" } },
      ],
      lockfiles: [],
    });
    expect(analyzeSupplyChain(input)).toEqual(analyzeSupplyChain(input));
  });
});
