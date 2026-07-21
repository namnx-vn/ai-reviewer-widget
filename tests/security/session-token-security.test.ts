import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import { SecurityAnalysisEngine } from "../../src/analyzer/security/engine/security-analysis-engine";
import type { SecurityRule } from "../../src/analyzer/security/model/types";
import { SecurityRuleRegistry } from "../../src/analyzer/security/registry/security-rule-registry";
import { sessionTokenRules } from "../../src/analyzer/security/rules/session";

function analyze(source: string): readonly string[] {
  const registry = new SecurityRuleRegistry();
  for (const rule of sessionTokenRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({ source, file: "src/session.ts", ast: parseSource(source) }, registry).map((finding) => finding.ruleId);
}

describe("phase 3.6.8 session and token security", () => {
  it("publishes the stable session and JWT rule set", () => {
    expect(sessionTokenRules.map((rule: SecurityRule) => rule.meta.id)).toEqual([
      "security.session.local-storage-token", "security.session.session-storage-token",
      "security.session.cookie-http-only", "security.session.cookie-secure", "security.session.cookie-same-site",
      "security.session.token-in-url", "security.session.predictable-session-id", "security.jwt.none-algorithm",
      "security.jwt.unverified", "security.jwt.exp-validation", "security.jwt.issuer-validation",
      "security.jwt.audience-validation", "security.jwt.weak-secret",
    ]);
  });

  it.each([
    ['local storage token', 'localStorage.setItem("accessToken", token);', "security.session.local-storage-token"],
    ['session storage token', 'sessionStorage.setItem("jwt", token);', "security.session.session-storage-token"],
    ['cookie missing httpOnly', 'res.cookie("session", token, { secure: true, sameSite: "lax" });', "security.session.cookie-http-only"],
    ['cookie missing secure', 'res.cookie("session", token, { httpOnly: true, sameSite: "strict" });', "security.session.cookie-secure"],
    ['cookie missing sameSite', 'res.cookie("session", token, { httpOnly: true, secure: true });', "security.session.cookie-same-site"],
    ['token in URL', 'fetch(`/api/profile?access_token=${token}`);', "security.session.token-in-url"],
    ['predictable session id', 'const sessionId = Math.random().toString(36);', "security.session.predictable-session-id"],
    ['none JWT algorithm', 'jwt.verify(token, key, { algorithms: ["none"] });', "security.jwt.none-algorithm"],
    ['unverified JWT', 'jwt.decode(token);', "security.jwt.unverified"],
    ['missing expiration validation', 'jwt.verify(token, key, { ignoreExpiration: true });', "security.jwt.exp-validation"],
    ['missing issuer validation', 'jwt.verify(token, key, { audience: "app" });', "security.jwt.issuer-validation"],
    ['missing audience validation', 'jwt.verify(token, key, { issuer: "issuer" });', "security.jwt.audience-validation"],
    ['weak JWT secret', 'jwt.sign(payload, "secret");', "security.jwt.weak-secret"],
  ])("detects %s", (_name, source, ruleId) => expect(analyze(source)).toContain(ruleId));

  it("recognizes imported aliases and accepts explicit secure cookie and JWT options", () => {
    const source = `
      import { verify as verifyJwt } from "jsonwebtoken";
      res.cookie("session", token, { httpOnly: true, secure: true, sameSite: "strict" });
      verifyJwt(token, secret, { algorithms: ["RS256"], issuer: "issuer", audience: "app" });
    `;
    expect(analyze(source)).toEqual([]);
  });

  it("does not infer findings from reads, strings, or dynamic options", () => {
    const source = `
      const documentation = "localStorage.setItem(token) jwt.verify";
      const token = localStorage.getItem("accessToken");
      res.cookie("session", token, cookieOptions);
      jwt.verify(token, key, verificationOptions);
    `;
    expect(analyze(source)).toEqual([]);
  });
});
