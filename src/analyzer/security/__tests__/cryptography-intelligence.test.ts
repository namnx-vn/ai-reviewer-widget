import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import {
  createCryptoRules,
  cryptoRules,
  DEFAULT_CRYPTO_POLICY,
  SecurityAnalysisEngine,
  SecurityRuleRegistry,
} from "..";

function analyze(source: string, rules = cryptoRules) {
  const registry = new SecurityRuleRegistry();
  for (const rule of rules) {
    registry.register(rule);
  }
  return new SecurityAnalysisEngine().analyze({
    source,
    file: "src/crypto.ts",
    ast: parseSource(source),
  }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.5 cryptography intelligence", () => {
  it("registers ten stable crypto rule IDs", () => {
    expect(cryptoRules.map((rule) => rule.meta.id)).toEqual([
      "security.crypto.weak-hash",
      "security.crypto.weak-cipher",
      "security.crypto.ecb-mode",
      "security.crypto.static-iv",
      "security.crypto.hardcoded-key",
      "security.crypto.insecure-random",
      "security.crypto.predictable-token",
      "security.crypto.password-without-kdf",
      "security.crypto.weak-kdf",
      "security.crypto.custom-crypto",
    ]);
  });

  it("detects weak Node crypto hashes through direct, namespace, and aliased imports", () => {
    const source = `
      import crypto from "node:crypto";
      import { createHash as hash } from "crypto";
      const checksum = crypto.createHash("sha1").update(data).digest("hex");
      const passwordDigest = hash("md5").update(password).digest("hex");
    `;
    const findings = analyze(source).filter((finding) => finding.ruleId === "security.crypto.weak-hash");
    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.confidence)).toContain("high");
    expect(findings.map((finding) => finding.confidence)).toContain("medium");
  });

  it("detects weak Web Crypto digest algorithms and accepts strong hashes", () => {
    const weak = `crypto.subtle.digest("SHA-1", payload);`;
    const safe = `crypto.subtle.digest("SHA-256", payload);`;
    expect(ruleIds(weak)).toContain("security.crypto.weak-hash");
    expect(ruleIds(safe)).not.toContain("security.crypto.weak-hash");
  });

  it("detects weak ciphers and ECB mode while accepting AES-GCM", () => {
    const weak = `
      import { createCipheriv } from "node:crypto";
      createCipheriv("des-ede3-cbc", key, iv);
      createCipheriv("aes-256-ecb", key, null);
    `;
    const safe = `
      import { createCipheriv } from "node:crypto";
      createCipheriv("aes-256-gcm", key, iv);
    `;
    expect(ruleIds(weak)).toContain("security.crypto.weak-cipher");
    expect(ruleIds(weak)).toContain("security.crypto.ecb-mode");
    expect(ruleIds(safe)).not.toContain("security.crypto.weak-cipher");
    expect(ruleIds(safe)).not.toContain("security.crypto.ecb-mode");
  });

  it("detects static IVs and hardcoded keys for Node crypto", () => {
    const source = `
      import { createCipheriv } from "node:crypto";
      createCipheriv("aes-256-gcm", Buffer.from("01234567890123456789012345678901"), Buffer.alloc(12));
    `;
    expect(ruleIds(source)).toContain("security.crypto.static-iv");
    expect(ruleIds(source)).toContain("security.crypto.hardcoded-key");
  });

  it("detects hardcoded Web Crypto imported keys", () => {
    const source = `
      crypto.subtle.importKey(
        "raw",
        new Uint8Array([1, 2, 3, 4]),
        { name: "AES-GCM" },
        false,
        ["encrypt"],
      );
    `;
    expect(ruleIds(source)).toContain("security.crypto.hardcoded-key");
  });

  it("flags Math.random only in security-sensitive material and token contexts", () => {
    const source = `
      const encryptionKey = Math.random().toString(36);
      const resetToken = Math.random().toString(36);
      const animationOffset = Math.random() * 100;
    `;
    const ids = ruleIds(source);
    expect(ids).toContain("security.crypto.insecure-random");
    expect(ids).toContain("security.crypto.predictable-token");
    expect(ids.filter((id) => id === "security.crypto.insecure-random")).toHaveLength(1);
    expect(ids.filter((id) => id === "security.crypto.predictable-token")).toHaveLength(1);
  });

  it("does not flag secure random APIs", () => {
    const source = `
      import { randomBytes, randomUUID } from "node:crypto";
      const resetToken = randomBytes(32).toString("hex");
      const sessionToken = randomUUID();
      const nonce = crypto.getRandomValues(new Uint8Array(12));
    `;
    expect(ruleIds(source)).not.toContain("security.crypto.insecure-random");
    expect(ruleIds(source)).not.toContain("security.crypto.predictable-token");
  });

  it("detects password hashing without a dedicated KDF even with SHA-256", () => {
    const source = `
      import { createHash } from "node:crypto";
      function hashPassword(password: string) {
        return createHash("sha256").update(password).digest("hex");
      }
    `;
    expect(ruleIds(source)).toContain("security.crypto.password-without-kdf");
    expect(ruleIds(source)).not.toContain("security.crypto.weak-hash");
  });

  it("detects weak PBKDF2 iterations for Node and Web Crypto", () => {
    const source = `
      import { pbkdf2Sync } from "node:crypto";
      pbkdf2Sync(password, salt, 10_000, 32, "sha256");
      crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 50_000, hash: "SHA-256" },
        keyMaterial,
        256,
      );
    `;
    expect(ruleIds(source).filter((id) => id === "security.crypto.weak-kdf")).toHaveLength(2);
  });

  it("accepts policy-compliant PBKDF2 and does not invent certainty for dynamic parameters", () => {
    const source = `
      import { createHash, pbkdf2Sync } from "node:crypto";
      pbkdf2Sync(password, salt, 300_000, 32, "sha256");
      pbkdf2Sync(password, salt, iterations, 32, "sha256");
      createHash(hashAlgorithm).update(payload).digest("hex");
    `;
    expect(ruleIds(source)).not.toContain("security.crypto.weak-kdf");
    expect(ruleIds(source)).not.toContain("security.crypto.weak-hash");
  });

  it("detects custom crypto-like bitwise implementations but not wrappers around vetted crypto", () => {
    const custom = `
      const encryptBlock = (input: number, key: number) => {
        return ((input ^ key) << 3) | ((input ^ key) >>> 5);
      };
    `;
    const wrapper = `
      import { createHash } from "node:crypto";
      function hashPayload(value: string) {
        return createHash("sha256").update(value).digest("hex");
      }
    `;
    expect(ruleIds(custom)).toContain("security.crypto.custom-crypto");
    expect(ruleIds(wrapper)).not.toContain("security.crypto.custom-crypto");
  });

  it("supports policy overrides independently from AST detection", () => {
    const policy = {
      ...DEFAULT_CRYPTO_POLICY,
      minimumPbkdf2Iterations: 500_000,
      weakHashes: new Set([...DEFAULT_CRYPTO_POLICY.weakHashes, "sha256"]),
    };
    const rules = createCryptoRules(policy);
    const source = `
      import { createHash, pbkdf2Sync } from "node:crypto";
      const checksum = createHash("sha256").update(data).digest("hex");
      pbkdf2Sync(password, salt, 300_000, 32, "sha256");
    `;
    const ids = analyze(source, rules).map((finding) => finding.ruleId);
    expect(ids).toContain("security.crypto.weak-hash");
    expect(ids).toContain("security.crypto.weak-kdf");
  });

  it("produces deterministic finding IDs and ordering", () => {
    const source = `
      import { createHash, createCipheriv } from "node:crypto";
      const resetToken = Math.random().toString(36);
      const digest = createHash("sha1").update(data).digest("hex");
      createCipheriv("aes-256-gcm", key, Buffer.alloc(12));
    `;
    const first = analyze(source);
    const second = analyze(source);
    expect(first.map((finding) => finding.id)).toEqual(second.map((finding) => finding.id));
    expect(first.map((finding) => finding.ruleId)).toEqual(second.map((finding) => finding.ruleId));
  });
});
