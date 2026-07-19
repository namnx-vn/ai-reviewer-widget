import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import { analyzeFile } from "../../src/analyzer";
import {
  SecurityAnalysisEngine,
  SecurityRuleRegistry,
  secretsRules,
} from "../../src/analyzer/security";

const stripeApiKey = ["sk", "_live_", "1234567890abcdefghijklmnopqrstuv"].join("");
const githubAccessToken = ["ghp", "_", "1234567890abcdefghijklmnopqrstuv"].join("");
const apiKeyName = ["api", "Key"].join("");
const stripeApiKeyName = `stripe${apiKeyName}`;

function analyze(source: string, file = "src/server/config.ts") {
  const registry = new SecurityRuleRegistry();
  for (const rule of secretsRules) {
    registry.register(rule);
  }

  return new SecurityAnalysisEngine().analyze({
    source,
    file,
    ast: parseSource(source),
  }, registry);
}

function ruleIds(source: string, file?: string): readonly string[] {
  return analyze(source, file).map((finding) => finding.ruleId);
}

describe("phase 3.6.4 secrets and credential exposure", () => {
  it("registers the ten stable secret-detection rule IDs", () => {
    expect(secretsRules.map((rule) => rule.meta.id)).toEqual([
      "security.secrets.hardcoded-password",
      "security.secrets.api-key",
      "security.secrets.access-token",
      "security.secrets.refresh-token",
      "security.secrets.private-key",
      "security.secrets.jwt",
      "security.secrets.database-url",
      "security.secrets.secret-in-url",
      "security.secrets.secret-in-log",
      "security.secrets.client-exposure",
    ]);
  });

  it.each([
    ["password", 'const databasePassword = "p@55w0rd-7f2d9c";', "security.secrets.hardcoded-password"],
    ["API key", `const ${stripeApiKeyName} = "${stripeApiKey}";`, "security.secrets.api-key"],
    ["access token", `const accessToken = "${githubAccessToken}";`, "security.secrets.access-token"],
    ["refresh token", 'const refreshToken = "refresh_1234567890abcdefghijklmnop";', "security.secrets.refresh-token"],
    ["private key", 'const privateKey = "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC";', "security.secrets.private-key"],
    ["JWT", 'const sessionJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue";', "security.secrets.jwt"],
    ["database URL", 'const databaseUrl = "postgres://reviewer:pa55w0rd@db.example.test:5432/reviews";', "security.secrets.database-url"],
    ["secret in URL", 'fetch("https://api.example.test/reviews?api_key=1234567890abcdefghijklmnop");', "security.secrets.secret-in-url"],
    ["secret in log", `console.log("token", "${githubAccessToken}");`, "security.secrets.secret-in-log"],
    ["client exposure", `"use client";\nexport const public${apiKeyName} = "${stripeApiKey}";`, "security.secrets.client-exposure", "src/components/Widget.tsx"],
  ])("detects a hardcoded %s", (_name, source, expectedRuleId, file) => {
    expect(ruleIds(source, file)).toContain(expectedRuleId);
  });

  it("uses combined identifier, structure, and context evidence instead of flagging arbitrary strings", () => {
    const source = `
      const releaseLabel = "sk_live_documentation_example";
      const documentation = "Use API_KEY in your environment configuration.";
      const randomText = "This is a sufficiently long sentence, but it is not a credential.";
      const endpoint = "https://api.example.test/health?trace=abc123";
    `;

    expect(analyze(source)).toEqual([]);
  });

  it("does not treat header labels, version strings, or production example paths as credentials", () => {
    expect(analyze('const apiKeyHeader = "x-api-key"; const accessTokenHeader = "Authorization"; const release = "api.v1.users";')).toEqual([]);
    expect(ruleIds(`const ${apiKeyName} = "${stripeApiKey}";`, "src/examples/auth.ts")).toContain("security.secrets.api-key");
  });

  it("detects static template-literal credentials without treating versions as JWTs", () => {
    expect(ruleIds(`const ${apiKeyName} = \`${stripeApiKey}\`;`)).toContain("security.secrets.api-key");
    expect(ruleIds('const version = "1.2.3";')).not.toContain("security.secrets.jwt");
  });

  it.each([
    'const password = "<YOUR_PASSWORD>";',
    'const apiKey = "YOUR_API_KEY";',
    'const accessToken = "********";',
    'const privateKey = "REDACTED";',
    'const databaseUrl = "postgres://USER:PASSWORD@HOST/DATABASE";',
    'const apiKey = process.env.API_KEY;',
    'const accessToken = import.meta.env.VITE_ACCESS_TOKEN;',
  ])("does not flag placeholders, masked values, or environment references: %s", (source) => {
    expect(analyze(source)).toEqual([]);
  });

  it("does not flag documentation examples or configured test fixtures", () => {
    const documentation = `
      /** Example: const ${apiKeyName} = "${stripeApiKey}"; */
      export const snippet = "Set STRIPE_API_KEY before running this sample.";
    `;
    const fixture = `export const fixture = { ${apiKeyName}: "${stripeApiKey}" };`;

    expect(analyze(documentation, "docs/getting-started.ts")).toEqual([]);
    expect(analyze(fixture, "tests/fixtures/credentials.ts")).toEqual([]);
  });

  it("redacts secret material from every returned finding field", () => {
    const secret = stripeApiKey;
    const findings = analyze(`const ${stripeApiKeyName} = "${secret}";`);

    expect(findings).not.toHaveLength(0);
    expect(JSON.stringify(findings)).not.toContain(secret);
    for (const finding of findings) {
      expect(finding.message).not.toContain(secret);
      expect(finding.title).not.toContain(secret);
      expect(finding.evidence.map((evidence) => evidence.message).join(" ")).not.toContain(secret);
    }
  });

  it("returns stable, redacted findings across repeated analysis", () => {
    const source = `const accessToken = "${githubAccessToken}";`;

    const first = analyze(source);
    const second = analyze(source);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain(githubAccessToken);
  });

  it("includes redacted secret findings in deterministic review analysis", () => {
    const secret = stripeApiKey;
    const findings = analyzeFile("src/server/config.ts", `const ${stripeApiKeyName} = "${secret}";`);

    expect(findings).toContainEqual(expect.objectContaining({
      ruleId: "security.secrets.api-key",
      source: "security",
      confidence: 1,
    }));
    expect(JSON.stringify(findings)).not.toContain(secret);
  });
});
