import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import {
  authenticationRules,
  SecurityAnalysisEngine,
  SecurityRuleRegistry,
} from "../../src/analyzer/security";

const fixturePassword = ["change", "-me-now"].join("");
const credentialObjectName = ["cred", "entials"].join("");
const passwordFieldName = ["pass", "word"].join("");

function analyze(source: string, file = "src/auth.ts") {
  const registry = new SecurityRuleRegistry();
  for (const rule of authenticationRules) {
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

describe("phase 3.6.6 authentication intelligence", () => {
  it("registers the ten stable authentication rule IDs", () => {
    expect(authenticationRules.map((rule) => rule.meta.id)).toEqual([
      "security.auth.hardcoded-credential",
      "security.auth.plaintext-password",
      "security.auth.weak-password-storage",
      "security.auth.authentication-bypass",
      "security.auth.client-side-auth",
      "security.auth.user-enumeration",
      "security.auth.password-reset-token",
      "security.auth.oauth-state-missing",
      "security.auth.oauth-pkce-missing",
      "security.auth.jwt-decode-without-verify",
    ]);
  });

  it.each([
    [
      "hardcoded credential",
      `const ${credentialObjectName} = { username: "admin", ${passwordFieldName}: "${fixturePassword}" };`,
      "security.auth.hardcoded-credential",
    ],
    [
      "plaintext password persistence",
      "await users.insert({ email, password: req.body.password });",
      "security.auth.plaintext-password",
    ],
    [
      "weak password storage",
      'const passwordHash = createHash("md5").update(password).digest("hex");',
      "security.auth.weak-password-storage",
    ],
    [
      "authentication bypass",
      "if (req.query.skipAuth === \"true\") return next();",
      "security.auth.authentication-bypass",
    ],
    [
      "client-side authentication decision",
      '"use client"; if (localStorage.getItem("isAdmin")) { showAdminPanel(); }',
      "security.auth.client-side-auth",
    ],
    [
      "user enumeration",
      'if (!user) return res.status(404).json({ error: "User not found" });',
      "security.auth.user-enumeration",
    ],
    [
      "predictable password reset token",
      "const passwordResetToken = Math.random().toString(36);",
      "security.auth.password-reset-token",
    ],
    [
      "OAuth authorization request without state",
      'oauth.authorize({ clientId, redirectUri, responseType: "code" });',
      "security.auth.oauth-state-missing",
    ],
    [
      "OAuth authorization-code request without PKCE",
      'oauth.authorize({ clientId, redirectUri, responseType: "code", state });',
      "security.auth.oauth-pkce-missing",
    ],
    [
      "JWT decoding used as an authentication decision",
      "const claims = jwt.decode(token); if (claims?.sub) return next();",
      "security.auth.jwt-decode-without-verify",
    ],
  ])("detects %s", (_name, source, expectedRuleId) => {
    expect(ruleIds(source)).toContain(expectedRuleId);
  });

  it("resolves JWT namespace and imported aliases, while recognizing verify as safe", () => {
    const decodedViaAlias = `
      import { decode as decodeJwt } from "jsonwebtoken";
      const claims = decodeJwt(token);
      if (claims?.role === "admin") allow();
    `;
    const decodedViaNamespace = `
      import * as jsonwebtoken from "jsonwebtoken";
      const claims = jsonwebtoken.decode(token);
      if (claims) allow();
    `;
    const verified = `
      import { verify } from "jsonwebtoken";
      const claims = verify(token, publicKey);
      if (claims.sub) allow();
    `;

    expect(ruleIds(decodedViaAlias)).toContain("security.auth.jwt-decode-without-verify");
    expect(ruleIds(decodedViaNamespace)).toContain("security.auth.jwt-decode-without-verify");
    expect(ruleIds(verified)).not.toContain("security.auth.jwt-decode-without-verify");
  });

  it("accepts password hashing and cryptographically random reset tokens", () => {
    const source = `
      import { randomBytes, scrypt } from "node:crypto";
      const passwordHash = await scrypt(password, salt, 64);
      const resetToken = randomBytes(32).toString("hex");
      await users.insert({ email, passwordHash });
    `;

    const ids = ruleIds(source);
    expect(ids).not.toContain("security.auth.plaintext-password");
    expect(ids).not.toContain("security.auth.weak-password-storage");
    expect(ids).not.toContain("security.auth.password-reset-token");
  });

  it("recognizes OAuth state and PKCE, including snake_case configuration", () => {
    const source = `
      oauth.authorize({
        clientId,
        redirectUri,
        responseType: "code",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
    `;

    const ids = ruleIds(source);
    expect(ids).not.toContain("security.auth.oauth-state-missing");
    expect(ids).not.toContain("security.auth.oauth-pkce-missing");
  });

  it("does not infer application-wide authentication from incomplete context", () => {
    const source = `
      export function listReviews() {
        return database.reviews.findMany();
      }
    `;

    expect(analyze(source)).toEqual([]);
  });

  it("does not flag authentication-related strings, constants, or client-side display state", () => {
    const source = `
      const documentation = "jwt.decode(token) must not verify tokens";
      const statusText = "User not found";
      const signedInLabel = localStorage.getItem("signedInLabel");
      renderBadge(signedInLabel);
    `;

    expect(analyze(source)).toEqual([]);
  });

  it("produces stable finding IDs, evidence, and ordering", () => {
    const source = `
      const ${credentialObjectName} = { ${passwordFieldName}: "${fixturePassword}" };
      const resetToken = Math.random().toString(36);
      const claims = jwt.decode(token);
      if (claims?.sub) allow();
    `;

    const first = analyze(source);
    const second = analyze(source);

    expect(first.map((finding) => finding.id)).toEqual(second.map((finding) => finding.id));
    expect(first.map((finding) => finding.ruleId)).toEqual(second.map((finding) => finding.ruleId));
    expect(first.map((finding) => finding.evidence)).toEqual(second.map((finding) => finding.evidence));
  });
});
