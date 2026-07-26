import type {
  SecurityConfidence,
  SecurityFinding,
  SecuritySeverity,
} from "../model/types";

export type SecurityProfileId =
  | "security/default"
  | "security/strict"
  | "security/financial"
  | "security/banking";

export type SecurityStorageMechanism =
  | "server-session"
  | "http-only-cookie"
  | "memory"
  | "local-storage"
  | "session-storage";

export type SecurityTlsVersion = "1.2" | "1.3";

export interface SecurityRuleProfileOverride {
  readonly ruleId: string;
  readonly enabled?: boolean;
  readonly severity?: SecuritySeverity;
  readonly minimumConfidence?: SecurityConfidence;
}

export interface SecurityCryptoProfilePolicy {
  readonly allowedAlgorithms?: readonly string[];
  readonly minimumPbkdf2Iterations?: number;
  readonly minimumRsaBits?: number;
}

export interface SecurityStorageProfilePolicy {
  readonly allowedMechanisms?: readonly SecurityStorageMechanism[];
}

export interface SecurityTransportProfilePolicy {
  readonly requireTls?: boolean;
  readonly requireCertificateVerification?: boolean;
  readonly minimumTlsVersion?: SecurityTlsVersion;
}

export interface SecurityQualityGateProfilePolicy {
  readonly failOnSeverities?: readonly SecuritySeverity[];
  readonly minimumConfidence?: SecurityConfidence;
  readonly mandatoryRuleIds?: readonly string[];
}

export interface SecurityProfileDefinition {
  readonly id: string;
  readonly extends?: string;
  readonly minimumConfidence?: SecurityConfidence;
  readonly ruleOverrides?: readonly SecurityRuleProfileOverride[];
  readonly crypto?: SecurityCryptoProfilePolicy;
  readonly storage?: SecurityStorageProfilePolicy;
  readonly transport?: SecurityTransportProfilePolicy;
  readonly qualityGate?: SecurityQualityGateProfilePolicy;
}

export interface ResolvedSecurityProfile {
  readonly id: string;
  readonly lineage: readonly string[];
  readonly minimumConfidence: SecurityConfidence;
  readonly ruleOverrides: readonly SecurityRuleProfileOverride[];
  readonly crypto: SecurityCryptoProfilePolicy;
  readonly storage: SecurityStorageProfilePolicy;
  readonly transport: SecurityTransportProfilePolicy;
  readonly qualityGate: SecurityQualityGateProfilePolicy;
}

const DEFAULT_PROFILE: SecurityProfileDefinition = {
  id: "security/default",
  minimumConfidence: "low",
  crypto: {
    minimumPbkdf2Iterations: 210_000,
    minimumRsaBits: 2048,
  },
  storage: {
    allowedMechanisms: ["server-session", "http-only-cookie", "memory", "local-storage", "session-storage"],
  },
  transport: {
    requireTls: false,
    requireCertificateVerification: true,
    minimumTlsVersion: "1.2",
  },
  qualityGate: {
    failOnSeverities: ["critical"],
    minimumConfidence: "high",
    mandatoryRuleIds: [],
  },
};

const STRICT_PROFILE: SecurityProfileDefinition = {
  id: "security/strict",
  extends: "security/default",
  minimumConfidence: "medium",
  storage: {
    allowedMechanisms: ["server-session", "http-only-cookie", "memory", "session-storage"],
  },
  transport: {
    requireTls: true,
    requireCertificateVerification: true,
    minimumTlsVersion: "1.2",
  },
  qualityGate: {
    failOnSeverities: ["critical", "high"],
    minimumConfidence: "medium",
  },
};

const FINANCIAL_PROFILE: SecurityProfileDefinition = {
  id: "security/financial",
  extends: "security/strict",
  crypto: {
    allowedAlgorithms: [
      "aes-256-gcm",
      "chacha20-poly1305",
      "rsa-oaep",
      "sha-256",
      "sha-384",
      "sha-512",
      "hmac-sha256",
      "hmac-sha384",
      "hmac-sha512",
    ],
  },
  storage: {
    allowedMechanisms: ["server-session", "http-only-cookie", "memory"],
  },
  qualityGate: {
    mandatoryRuleIds: [
      "security.logging.payment-data",
      "security.logging.credential",
      "security.network.tls-verification-disabled",
      "security.injection.command",
      "security.injection.sql",
      "security.business.client-controlled-balance",
    ],
  },
};

const BANKING_PROFILE: SecurityProfileDefinition = {
  id: "security/banking",
  extends: "security/financial",
  ruleOverrides: [
    { ruleId: "security.injection.command", severity: "critical" },
    { ruleId: "security.injection.sql", severity: "critical" },
    { ruleId: "security.network.tls-verification-disabled", severity: "critical" },
    { ruleId: "security.auth.jwt-decode-without-verify", severity: "critical" },
    { ruleId: "security.authz.client-side-only", severity: "critical" },
    { ruleId: "security.ssrf.untrusted-url", severity: "critical" },
    { ruleId: "security.react.sensitive-local-storage", severity: "critical" },
  ],
  qualityGate: {
    mandatoryRuleIds: [
      "security.secrets.api-key",
      "security.secrets.access-token",
      "security.secrets.private-key",
      "security.data.client-storage-sensitive",
      "security.auth.jwt-decode-without-verify",
      "security.authz.client-side-only",
      "security.ssrf.untrusted-url",
      "security.crypto.insecure-random",
      "security.execution.no-eval",
      "security.execution.no-new-function",
      "security.react.sensitive-local-storage",
      "security.business.transaction-idempotency",
      "security.business.transaction-replay-risk",
    ],
  },
};

export const SECURITY_PROFILE_DEFINITIONS: readonly SecurityProfileDefinition[] = [
  DEFAULT_PROFILE,
  STRICT_PROFILE,
  FINANCIAL_PROFILE,
  BANKING_PROFILE,
];

export function getSecurityProfile(id: SecurityProfileId): ResolvedSecurityProfile {
  return resolveSecurityProfile(id);
}

export function resolveSecurityProfile(
  id: string,
  definitions: readonly SecurityProfileDefinition[] = SECURITY_PROFILE_DEFINITIONS,
): ResolvedSecurityProfile {
  const definitionsById = new Map<string, SecurityProfileDefinition>();
  for (const definition of definitions) {
    if (definitionsById.has(definition.id)) {
      throw new Error(`Duplicate security profile "${definition.id}".`);
    }
    definitionsById.set(definition.id, definition);
  }

  return resolveProfile(id, definitionsById, []);
}

export function applySecurityProfile(
  findings: readonly SecurityFinding[],
  profile: SecurityProfileId | ResolvedSecurityProfile,
): readonly SecurityFinding[] {
  const resolved = typeof profile === "string" ? getSecurityProfile(profile) : profile;
  const overrides = new Map<string, SecurityRuleProfileOverride>();
  for (const override of resolved.ruleOverrides) {
    overrides.set(override.ruleId, override);
  }
  const results: SecurityFinding[] = [];

  for (const finding of findings) {
    const override = overrides.get(finding.ruleId);
    if (override?.enabled === false) continue;

    const minimumConfidence = override?.minimumConfidence ?? resolved.minimumConfidence;
    if (confidenceRank(finding.confidence) < confidenceRank(minimumConfidence)) continue;

    const severity = override?.severity ?? finding.severity;
    results.push(severity === finding.severity ? finding : { ...finding, severity });
  }

  return results;
}

function resolveProfile(
  id: string,
  definitions: ReadonlyMap<string, SecurityProfileDefinition>,
  lineage: readonly string[],
): ResolvedSecurityProfile {
  if (lineage.includes(id)) {
    throw new Error(`Circular security profile inheritance: ${[...lineage, id].join(" -> ")}.`);
  }

  const definition = definitions.get(id);
  if (definition === undefined) {
    throw new Error(`Unknown security profile "${id}".`);
  }

  const parent = definition.extends === undefined
    ? emptyResolvedProfile()
    : resolveProfile(definition.extends, definitions, [...lineage, id]);

  return mergeProfile(parent, definition);
}

function emptyResolvedProfile(): ResolvedSecurityProfile {
  return {
    id: "",
    lineage: [],
    minimumConfidence: "low",
    ruleOverrides: [],
    crypto: {},
    storage: {},
    transport: {},
    qualityGate: {
      failOnSeverities: [],
      mandatoryRuleIds: [],
    },
  };
}

function mergeProfile(
  parent: ResolvedSecurityProfile,
  definition: SecurityProfileDefinition,
): ResolvedSecurityProfile {
  return {
    id: definition.id,
    lineage: [...parent.lineage, definition.id],
    minimumConfidence: definition.minimumConfidence ?? parent.minimumConfidence,
    ruleOverrides: mergeRuleOverrides(parent.ruleOverrides, definition.ruleOverrides ?? []),
    crypto: {
      allowedAlgorithms: definition.crypto?.allowedAlgorithms ?? parent.crypto.allowedAlgorithms,
      minimumPbkdf2Iterations: definition.crypto?.minimumPbkdf2Iterations ?? parent.crypto.minimumPbkdf2Iterations,
      minimumRsaBits: definition.crypto?.minimumRsaBits ?? parent.crypto.minimumRsaBits,
    },
    storage: {
      allowedMechanisms: definition.storage?.allowedMechanisms ?? parent.storage.allowedMechanisms,
    },
    transport: {
      requireTls: definition.transport?.requireTls ?? parent.transport.requireTls,
      requireCertificateVerification: definition.transport?.requireCertificateVerification ?? parent.transport.requireCertificateVerification,
      minimumTlsVersion: definition.transport?.minimumTlsVersion ?? parent.transport.minimumTlsVersion,
    },
    qualityGate: {
      failOnSeverities: definition.qualityGate?.failOnSeverities ?? parent.qualityGate.failOnSeverities,
      minimumConfidence: definition.qualityGate?.minimumConfidence ?? parent.qualityGate.minimumConfidence,
      mandatoryRuleIds: mergeStrings(
        parent.qualityGate.mandatoryRuleIds ?? [],
        definition.qualityGate?.mandatoryRuleIds ?? [],
      ),
    },
  };
}

function mergeRuleOverrides(
  parent: readonly SecurityRuleProfileOverride[],
  child: readonly SecurityRuleProfileOverride[],
): readonly SecurityRuleProfileOverride[] {
  const merged = new Map<string, SecurityRuleProfileOverride>();
  for (const override of parent) merged.set(override.ruleId, override);
  for (const override of child) {
    const existing = merged.get(override.ruleId);
    merged.set(override.ruleId, {
      ruleId: override.ruleId,
      enabled: override.enabled ?? existing?.enabled,
      severity: override.severity ?? existing?.severity,
      minimumConfidence: override.minimumConfidence ?? existing?.minimumConfidence,
    });
  }
  return [...merged.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function mergeStrings(parent: readonly string[], child: readonly string[]): readonly string[] {
  return [...new Set([...parent, ...child])].sort();
}

function confidenceRank(confidence: SecurityConfidence): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}
