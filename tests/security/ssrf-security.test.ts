import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import { SecurityAnalysisEngine } from "../../src/analyzer/security/engine/security-analysis-engine";
import type { SecurityRule } from "../../src/analyzer/security/model/types";
import { SecurityRuleRegistry } from "../../src/analyzer/security/registry/security-rule-registry";
import { ssrfRules } from "../../src/analyzer/security/rules/ssrf";

function analyze(source: string): readonly string[] {
  const registry = new SecurityRuleRegistry();
  for (const rule of ssrfRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({ source, file: "src/request.ts", ast: parseSource(source) }, registry).map((finding) => finding.ruleId);
}

describe("phase 3.6.12 SSRF security", () => {
  it("publishes the stable SSRF rule set", () => {
    expect(ssrfRules.map((rule: SecurityRule) => rule.meta.id)).toEqual([
      "security.ssrf.untrusted-request", "security.ssrf.metadata-endpoint", "security.ssrf.local-network",
      "security.ssrf.localhost", "security.ssrf.unsafe-redirect", "security.ssrf.weak-host-validation",
    ]);
  });

  it.each([
    ["direct request input", "fetch(req.query.url);", "security.ssrf.untrusted-request"],
    ["wrapped request input", "function load(url: string) { return fetch(url); } load(req.params.url);", "security.ssrf.untrusted-request"],
    ["cloud metadata endpoint", 'axios.get("http://169.254.169.254/latest/meta-data");', "security.ssrf.metadata-endpoint"],
    ["private network", 'fetch("http://10.0.0.8/admin");', "security.ssrf.local-network"],
    ["localhost", 'fetch("http://localhost:8080/admin");', "security.ssrf.localhost"],
    ["following redirects", 'fetch(req.query.url, { redirect: "follow" });', "security.ssrf.unsafe-redirect"],
    ["weak hostname check", 'if (req.query.url.includes("trusted.example")) fetch(req.query.url);', "security.ssrf.weak-host-validation"],
  ])("detects %s", (_name, source, ruleId) => expect(analyze(source)).toContain(ruleId));

  it("recognizes known imported request aliases and strong direct allowlist sanitizers", () => {
    expect(analyze(`
      import { get as request } from "axios";
      const safeUrl = assertAllowedUrl(req.query.url);
      request(safeUrl, { maxRedirects: 0 });
    `)).toEqual([]);
  });

  it("does not report safe redirects or unrelated string checks", () => {
    expect(analyze(`
      fetch("https://api.example.test", { redirect: "manual" });
      const documentation = "url.includes(trusted.example)";
      const url = req.query.url;
      const allowed = url.includes("trusted.example");
    `)).toEqual([]);
  });
});
