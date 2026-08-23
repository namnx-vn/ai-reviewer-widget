import { describe, expect, it, vi } from "vitest";

import type { ReviewWarning } from "../../review/types";

vi.mock("../security/review-findings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../security/review-findings")>();

  return {
    ...actual,
    analyzeSecurityFindingsWithWarnings(file: string, source: string) {
      const analysis = actual.analyzeSecurityFindingsWithWarnings(file, source);
      const warnings: readonly ReviewWarning[] = source.includes("SECURITY_WARNING_FIXTURE")
        ? [{
            code: "SECURITY_RULE_FAILED",
            message: `Security rule security.test.failure failed while analyzing ${file}.`,
          }]
        : [];

      return {
        findings: analysis.findings,
        warnings: [...analysis.warnings, ...warnings],
      };
    },
  };
});

import { analyzeFilesWithWarnings } from "..";

describe("analyzeFilesWithWarnings characterization", () => {
  it("keeps successful deterministic findings when a security rule reports a warning", () => {
    const result = analyzeFilesWithWarnings([{
      path: "src/example.ts",
      content: 'const SECURITY_WARNING_FIXTURE = true; eval("input");',
    }]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "security.no-eval",
        source: "ast",
        confidence: 1,
      }),
    ]));
    expect(result.warnings).toEqual([{
      code: "SECURITY_RULE_FAILED",
      message: "Security rule security.test.failure failed while analyzing src/example.ts.",
    }]);
  });

  it("does not send non-source files through source analyzers", () => {
    const result = analyzeFilesWithWarnings([{
      path: "docs/example.md",
      content: 'SECURITY_WARNING_FIXTURE\neval("input");',
    }]);

    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("preserves built-in finding family order", () => {
    const result = analyzeFilesWithWarnings([
      {
        path: "src/remote/Checkout.tsx",
        content: 'import x from "@remote/payment"; import lodash from "lodash"; console.log(x); eval(input);',
      },
      {
        path: "apps/host/shell/App.tsx",
        content: 'import ProductRow from "@remote/catalog/internal/ProductRow";',
      },
    ]);

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "quality.no-console",
      "security.no-eval",
      "security.execution.no-eval",
      "performance.heavy-library-whole-import",
      "mfe.no-remote-to-remote",
      "mfe.remote-deep-import",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("routes manifests to supply-chain analysis without parsing them as source", () => {
    const result = analyzeFilesWithWarnings([{
      path: "package.json",
      content: JSON.stringify({ scripts: { preinstall: "node bootstrap.js" } }),
    }]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "security.supply-chain.install-script" }),
      expect.objectContaining({ ruleId: "security.supply-chain.lockfile-missing" }),
    ]));
    expect(result.warnings).toEqual([]);
  });
});
