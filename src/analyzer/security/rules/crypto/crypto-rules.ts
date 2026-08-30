import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import {
  DEFAULT_CRYPTO_POLICY,
  isEcbMode,
  isWeakCipher,
  isWeakHash,
  type CryptoPolicy,
} from "../../policies/crypto-policy";
import type {
  SecurityConfidence,
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
  SecurityStandardMapping,
} from "../../model/types";
import {
  collectCryptoObservations,
  isHardcodedMaterial,
  type CryptoObservation,
} from "./crypto-model";

interface RuleDefinition {
  readonly meta: SecurityRuleMeta;
  readonly message: string;
  readonly suggestion: string;
  readonly matches: (
    observation: CryptoObservation,
    policy: CryptoPolicy,
  ) => MatchResult | undefined;
}

interface MatchResult {
  readonly node: TSESTree.Node;
  readonly evidence: string;
  readonly confidence?: SecurityConfidence;
}

const DEFINITIONS: readonly RuleDefinition[] = [
  define(
    "security.crypto.weak-hash",
    "Weak cryptographic hash",
    "medium",
    "CWE-328",
    "A cryptographic hash operation uses an algorithm considered weak for security-sensitive purposes.",
    "Use SHA-256 or stronger for general cryptographic hashing, and a dedicated password KDF for passwords.",
    (observation, policy) => observation.kind === "hash" &&
      observation.algorithm !== undefined &&
      isWeakHash(policy, observation.algorithm)
      ? {
          node: observation.node,
          evidence: `Weak hash algorithm: ${observation.algorithm}`,
          confidence: observation.passwordContext || sensitiveName(observation.contextName, policy)
            ? "high"
            : "medium",
        }
      : undefined,
  ),
  define(
    "security.crypto.weak-cipher",
    "Weak cipher algorithm",
    "high",
    "CWE-327",
    "Encryption or decryption uses a cipher family prohibited by the cryptography policy.",
    "Use an approved authenticated cipher such as AES-GCM with policy-approved key sizes.",
    (observation, policy) => observation.kind === "cipher" &&
      observation.algorithm !== undefined &&
      isWeakCipher(policy, observation.algorithm)
      ? { node: observation.node, evidence: `Weak cipher algorithm: ${observation.algorithm}` }
      : undefined,
  ),
  define(
    "security.crypto.ecb-mode",
    "ECB cipher mode",
    "high",
    "CWE-327",
    "A block cipher is configured in ECB mode, which leaks plaintext structure.",
    "Use an authenticated mode such as AES-GCM with a unique nonce for every encryption operation.",
    (observation, policy) => observation.kind === "cipher" &&
      observation.algorithm !== undefined &&
      isEcbMode(policy, observation.algorithm)
      ? { node: observation.node, evidence: `ECB mode algorithm: ${observation.algorithm}` }
      : undefined,
  ),
  define(
    "security.crypto.static-iv",
    "Static initialization vector",
    "high",
    "CWE-329",
    "A cipher operation uses a statically defined initialization vector or nonce.",
    "Generate a fresh unpredictable IV/nonce for each encryption operation and store it with the ciphertext.",
    (observation) => observation.kind === "cipher" &&
      observation.iv !== undefined &&
      isHardcodedMaterial(observation.iv)
      ? { node: observation.iv, evidence: "Static IV/nonce material" }
      : undefined,
  ),
  define(
    "security.crypto.hardcoded-key",
    "Hardcoded cryptographic key",
    "critical",
    "CWE-321",
    "Cryptographic key material is embedded directly in source code.",
    "Load keys from an approved secret manager or hardware-backed key service and rotate exposed key material.",
    (observation) => observation.kind === "hardcoded-key"
      ? { node: observation.key, evidence: observation.label }
      : observation.kind === "cipher" && observation.key !== undefined && isHardcodedMaterial(observation.key)
        ? { node: observation.key, evidence: "Hardcoded cipher key material" }
        : undefined,
  ),
  define(
    "security.crypto.insecure-random",
    "Insecure randomness for cryptographic material",
    "high",
    "CWE-338",
    "Math.random() is used to derive cryptographic material such as a key, IV, salt, secret, or seed.",
    "Use crypto.randomBytes(), crypto.randomInt(), crypto.randomUUID(), or crypto.getRandomValues() as appropriate.",
    (observation, policy) => observation.kind === "random" &&
      observation.contextName !== undefined &&
      policy.cryptoMaterialNamePattern.test(observation.contextName)
      ? {
          node: observation.node,
          evidence: `Predictable randomness assigned in ${observation.contextName}`,
        }
      : undefined,
  ),
  define(
    "security.crypto.predictable-token",
    "Predictable security token",
    "critical",
    "CWE-330",
    "Math.random() contributes to a token, session identifier, nonce, OTP, reset code, or similar security value.",
    "Generate security tokens from a cryptographically secure random source with sufficient entropy.",
    (observation, policy) => observation.kind === "random" &&
      observation.contextName !== undefined &&
      policy.tokenNamePattern.test(observation.contextName)
      ? {
          node: observation.node,
          evidence: `Predictable token context: ${observation.contextName}`,
        }
      : undefined,
  ),
  define(
    "security.crypto.password-without-kdf",
    "Password hashed without a password KDF",
    "high",
    "CWE-916",
    "Password-related data is processed with a general-purpose hash instead of a password key-derivation function.",
    "Use an approved password KDF such as Argon2id, scrypt, or policy-configured PBKDF2 parameters with a unique salt.",
    (observation) => observation.kind === "hash" && observation.passwordContext
      ? {
          node: observation.node,
          evidence: observation.algorithm === undefined
            ? "Password context uses a general-purpose hash"
            : `Password context uses ${observation.algorithm}`,
        }
      : undefined,
  ),
  define(
    "security.crypto.weak-kdf",
    "Weak password KDF parameters",
    "high",
    "CWE-916",
    "PBKDF2 is configured with an iteration count below the cryptography policy minimum.",
    "Increase PBKDF2 work factors to the configured policy minimum or use an approved memory-hard password KDF.",
    (observation, policy) => observation.kind === "kdf" &&
      observation.iterations !== undefined &&
      observation.iterations < policy.minimumPbkdf2Iterations
      ? {
          node: observation.node,
          evidence: `PBKDF2 iterations ${observation.iterations} < ${policy.minimumPbkdf2Iterations}`,
        }
      : undefined,
  ),
  define(
    "security.crypto.custom-crypto",
    "Custom cryptography implementation",
    "high",
    "CWE-327",
    "A crypto-named function implements bitwise cryptographic-looking transformations without using a recognized cryptographic primitive.",
    "Replace custom cryptography with vetted platform primitives and an approved construction from the cryptography policy.",
    (observation) => observation.kind === "custom-crypto"
      ? {
          node: observation.node,
          evidence: `Custom cryptography-like function: ${observation.name}`,
          confidence: "medium",
        }
      : undefined,
  ),
];

export function createCryptoRules(
  policy: CryptoPolicy = DEFAULT_CRYPTO_POLICY,
): readonly SecurityRule[] {
  return DEFINITIONS.map((definition) => createRule(definition, policy));
}

export const cryptoRules: readonly SecurityRule[] = createCryptoRules();

function define(
  id: string,
  title: string,
  severity: SecurityRuleMeta["defaultSeverity"],
  cwe: string,
  message: string,
  suggestion: string,
  matches: RuleDefinition["matches"],
): RuleDefinition {
  const standards: readonly SecurityStandardMapping[] = [{ standard: "cwe", id: cwe }];
  return {
    meta: {
      id,
      title,
      description: message,
      category: "crypto",
      defaultSeverity: severity,
      defaultConfidence: "high",
      standards,
    },
    message,
    suggestion,
    matches,
  };
}

function createRule(
  definition: RuleDefinition,
  policy: CryptoPolicy,
): SecurityRule {
  return {
    meta: definition.meta,
    check(context) {
      const observations = collectCryptoObservations(context.ast, policy);
      const findings: SecurityFinding[] = [];
      for (const observation of observations) {
        const match = definition.matches(observation, policy);
        if (match !== undefined) {
          findings.push(createFinding(context, definition, match));
        }
      }
      return findings;
    },
  };
}

function createFinding(
  context: SecurityRuleContext,
  definition: RuleDefinition,
  match: MatchResult,
): SecurityFinding {
  const location = getLocation(match.node, context.file);
  return {
    id: createSecurityFindingId({
      ruleId: definition.meta.id,
      path: context.file,
      range: location.range,
      sinkKind: "crypto-operation",
    }),
    ruleId: definition.meta.id,
    title: definition.meta.title,
    message: definition.message,
    severity: definition.meta.defaultSeverity,
    confidence: match.confidence ?? definition.meta.defaultConfidence,
    category: definition.meta.category,
    location,
    evidence: [{
      message: match.evidence,
      location,
      sinkKind: "crypto-operation",
    }],
    standards: definition.meta.standards,
    sinkKind: "crypto-operation",
    suggestion: definition.suggestion,
  };
}

function sensitiveName(name: string | undefined, policy: CryptoPolicy): boolean {
  return name !== undefined && (
    policy.tokenNamePattern.test(name) ||
    policy.cryptoMaterialNamePattern.test(name) ||
    policy.passwordNamePattern.test(name)
  );
}

function getLocation(
  node: TSESTree.Node,
  file: string,
): SecurityFinding["location"] {
  return {
    path: file,
    line: node.loc?.start.line,
    column: node.loc?.start.column,
    range: node.range === undefined
      ? undefined
      : { start: node.range[0], end: node.range[1] },
  };
}
