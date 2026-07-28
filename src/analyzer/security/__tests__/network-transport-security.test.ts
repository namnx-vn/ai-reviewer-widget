import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import { SecurityAnalysisEngine } from "../engine/security-analysis-engine";
import { SecurityRuleRegistry } from "../registry/security-rule-registry";
import { networkTransportRules } from "../rules/network";

function analyze(source: string) {
  const registry = new SecurityRuleRegistry();
  for (const rule of networkTransportRules) registry.register(rule);
  return new SecurityAnalysisEngine().analyze({
    source,
    file: "src/network.ts",
    ast: parseSource(source),
  }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.10 network and transport security", () => {
  it("registers stable network rule IDs", () => {
    expect(networkTransportRules.map((rule) => rule.meta.id)).toEqual([
      "security.network.insecure-http",
      "security.network.insecure-websocket",
      "security.network.tls-verification-disabled",
      "security.network.weak-tls",
      "security.network.permissive-cors",
      "security.network.credentials-wildcard-origin",
      "security.network.untrusted-proxy",
    ]);
  });

  it("detects insecure production HTTP and WebSocket endpoints but accepts localhost and secure schemes", () => {
    const source = `
      fetch("http://api.example.com/v1");
      const socket = new WebSocket("ws://stream.example.com");
      fetch("http://localhost:3000/health");
      fetch("https://api.example.com/v1");
      new WebSocket("wss://stream.example.com");
    `;
    expect(ruleIds(source)).toEqual(expect.arrayContaining([
      "security.network.insecure-http",
      "security.network.insecure-websocket",
    ]));
    expect(ruleIds(source).filter((id) => id === "security.network.insecure-http")).toHaveLength(1);
    expect(ruleIds(source).filter((id) => id === "security.network.insecure-websocket")).toHaveLength(1);
  });

  it("models known network API aliases without guessing dynamic endpoints", () => {
    const source = `
      import { request as get } from "node:http";
      get("http://payments.example.com");
      fetch(endpoint);
    `;
    expect(ruleIds(source)).toContain("security.network.insecure-http");
    expect(ruleIds(source).filter((id) => id === "security.network.insecure-http")).toHaveLength(1);
  });

  it("detects disabled TLS verification and explicitly weak TLS versions", () => {
    const source = `
      import https from "node:https";
      import { connect as tlsConnect } from "node:tls";
      https.request("https://api.example.com", { rejectUnauthorized: false });
      tlsConnect({ host: "api.example.com", minVersion: "TLSv1" });
      https.request("https://api.example.com", { rejectUnauthorized: enabled });
      tlsConnect({ host: "api.example.com", minVersion: requiredVersion });
    `;
    const ids = ruleIds(source);
    expect(ids).toContain("security.network.tls-verification-disabled");
    expect(ids).toContain("security.network.weak-tls");
    expect(ids.filter((id) => id === "security.network.tls-verification-disabled")).toHaveLength(1);
    expect(ids.filter((id) => id === "security.network.weak-tls")).toHaveLength(1);
  });

  it("detects permissive CORS and the credentials plus wildcard combination", () => {
    const source = `
      import cors from "cors";
      app.use(cors({ origin: "*" }));
      app.use(cors({ origin: "*", credentials: true }));
      app.use(cors({ origin: allowedOrigin, credentials: true }));
    `;
    const ids = ruleIds(source);
    expect(ids.filter((id) => id === "security.network.permissive-cors")).toHaveLength(2);
    expect(ids.filter((id) => id === "security.network.credentials-wildcard-origin")).toHaveLength(1);
  });

  it("accepts explicit trusted CORS origins and rejects unknown middleware names", () => {
    const source = `
      import cors from "cors";
      app.use(cors({ origin: "https://app.example.com", credentials: true }));
      middleware({ origin: "*", credentials: true });
    `;
    expect(ruleIds(source)).not.toContain("security.network.permissive-cors");
    expect(ruleIds(source)).not.toContain("security.network.credentials-wildcard-origin");
  });

  it("detects explicitly untrusted proxy settings through Express APIs and aliases", () => {
    const source = `
      import express from "express";
      const app = express();
      const configure = app.set;
      app.set("trust proxy", true);
      configure("trust proxy", 1);
      app.set("trust proxy", trustedProxy);
    `;
    expect(ruleIds(source).filter((id) => id === "security.network.untrusted-proxy")).toHaveLength(2);
  });

  it("produces deterministic findings", () => {
    const source = `
      fetch("http://api.example.com");
      app.use(cors({ origin: "*", credentials: true }));
    `;
    expect(analyze(source)).toEqual(analyze(source));
  });
});
