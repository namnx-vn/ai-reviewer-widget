import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../../model/types";

type SecretKind =
  | "hardcoded-password"
  | "api-key"
  | "access-token"
  | "refresh-token"
  | "private-key"
  | "jwt"
  | "database-url"
  | "secret-in-url"
  | "secret-in-log"
  | "client-exposure";

interface SecretMatch {
  readonly kind: SecretKind;
  readonly node: TSESTree.Node;
  readonly identifier?: string;
}

const SECRET_IDENTIFIER =
  /(?:password|passwd|pwd|api[-_]?key|access[-_]?token|refresh[-_]?token|private[-_]?key|secret|jwt|database[-_]?url|db[-_]?url)/i;
const PLACEHOLDER =
  /^(?:\$\{[^}]+\}|<[^>]+>|(?:your|example|test|dummy|fake|changeme|replace)[-_\s]?(?:key|token|secret|password)?|\*{3,}|x{6,}|redacted)$/i;
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/;
const JWT = /^eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const DATABASE_URL =
  /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s@]+@/i;
const API_KEY_PREFIX =
  /^(?:sk|pk|rk|ak|ghp|github_pat|xox[baprs]|AIza|AKIA)[-_][A-Za-z0-9_-]{8,}$/;

const META: Readonly<Record<SecretKind, SecurityRuleMeta>> = {
  "hardcoded-password": meta(
    "security.secrets.hardcoded-password",
    "Hardcoded password",
    "high",
    "CWE-798",
  ),
  "api-key": meta(
    "security.secrets.api-key",
    "Embedded API key",
    "high",
    "CWE-798",
  ),
  "access-token": meta(
    "security.secrets.access-token",
    "Embedded access token",
    "high",
    "CWE-798",
  ),
  "refresh-token": meta(
    "security.secrets.refresh-token",
    "Embedded refresh token",
    "high",
    "CWE-798",
  ),
  "private-key": meta(
    "security.secrets.private-key",
    "Embedded private key",
    "critical",
    "CWE-321",
  ),
  jwt: meta("security.secrets.jwt", "Embedded JWT", "high", "CWE-798"),
  "database-url": meta(
    "security.secrets.database-url",
    "Database URL with credentials",
    "critical",
    "CWE-798",
  ),
  "secret-in-url": meta(
    "security.secrets.secret-in-url",
    "Secret embedded in URL",
    "high",
    "CWE-598",
  ),
  "secret-in-log": meta(
    "security.secrets.secret-in-log",
    "Secret written to logs",
    "high",
    "CWE-532",
  ),
  "client-exposure": meta(
    "security.secrets.client-exposure",
    "Secret exposed to client bundle",
    "critical",
    "CWE-200",
  ),
};

export const secretsRules: readonly SecurityRule[] = (
  Object.keys(META) as SecretKind[]
).map((kind) => ({
  meta: META[kind],
  check(context) {
    return analyze(context)
      .filter((match) => match.kind === kind)
      .map((match) => createFinding(context, match));
  },
}));

function meta(
  id: string,
  title: string,
  severity: SecurityRuleMeta["defaultSeverity"],
  cwe: string,
): SecurityRuleMeta {
  return {
    id,
    title,
    description: `${title} is detected without retaining its value.`,
    category: "secrets",
    defaultSeverity: severity,
    defaultConfidence: "high",
    standards: [{ standard: "cwe", id: cwe }],
  };
}

function analyze(context: SecurityRuleContext): readonly SecretMatch[] {
  if (isExcludedContext(context.file)) return [];
  const matches: SecretMatch[] = [];
  const secretBindings = new Set<string>();
  const clientCode = isClientCode(context);

  visit(context.ast, (node) => {
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init !== null
    ) {
      const value = stringValue(node.init);
      const kinds = classify(node.id.name, value);
      for (const kind of kinds)
        matches.push({ kind, node, identifier: node.id.name });
      if (kinds.length > 0) secretBindings.add(node.id.name);
      if (clientCode && kinds.length > 0)
        matches.push({
          kind: "client-exposure",
          node,
          identifier: node.id.name,
        });
    }

    if (node.type === "Property") {
      const name = propertyName(node.key);
      const value = stringValue(node.value);
      if (name !== undefined) {
        const kinds = classify(name, value);
        for (const kind of kinds)
          matches.push({ kind, node, identifier: name });
        if (kinds.length > 0) secretBindings.add(name);
        if (clientCode && kinds.length > 0)
          matches.push({ kind: "client-exposure", node, identifier: name });
      }
    }

    if (node.type === "Literal" && typeof node.value === "string") {
      if (PRIVATE_KEY.test(node.value))
        matches.push({ kind: "private-key", node });
      else if (JWT.test(node.value) && !isPlaceholder(node.value))
        matches.push({ kind: "jwt", node });
      else if (
        DATABASE_URL.test(node.value) &&
        !isDatabasePlaceholder(node.value)
      )
        matches.push({ kind: "database-url", node });
      else if (hasSecretQuery(node.value))
        matches.push({ kind: "secret-in-url", node });
    }

    if (
      node.type === "CallExpression" &&
      isLogCall(node) &&
      node.arguments.some((argument) =>
        referencesSecret(argument, secretBindings),
      )
    ) {
      matches.push({ kind: "secret-in-log", node });
    }
  });

  return unique(matches);
}

function classify(
  identifier: string,
  value: string | undefined,
): readonly SecretKind[] {
  if (
    value === undefined ||
    isPlaceholder(value) ||
    isEnvironmentReference(value) ||
    isDatabasePlaceholder(value)
  )
    return [];
  const kinds: SecretKind[] = [];
  if (/private[-_]?key/i.test(identifier) || PRIVATE_KEY.test(value))
    kinds.push("private-key");
  if (
    /database|db/i.test(identifier) &&
    /url|uri|connection/i.test(identifier) &&
    DATABASE_URL.test(value)
  )
    kinds.push("database-url");
  if (/password|passwd|pwd/i.test(identifier)) kinds.push("hardcoded-password");
  if (
    /api[-_]?key/i.test(identifier) &&
    (API_KEY_PREFIX.test(value) || hasCredentialEntropy(value))
  )
    kinds.push("api-key");
  if (
    /access[-_]?token/i.test(identifier) &&
    (isKnownToken(value) || hasCredentialEntropy(value))
  )
    kinds.push("access-token");
  if (
    /refresh[-_]?token/i.test(identifier) &&
    (isKnownToken(value) || hasCredentialEntropy(value))
  )
    kinds.push("refresh-token");
  if (
    /jwt/i.test(identifier) ||
    (SECRET_IDENTIFIER.test(identifier) && JWT.test(value))
  )
    kinds.push("jwt");
  if (hasSecretQuery(value)) kinds.push("secret-in-url");
  return kinds;
}

function createFinding(
  context: SecurityRuleContext,
  match: SecretMatch,
): SecurityFinding {
  const location = locationOf(match.node, context.file);
  const metaForMatch = META[match.kind];
  return {
    id: createSecurityFindingId({
      ruleId: metaForMatch.id,
      path: context.file,
      range: location.range,
      sinkKind: "secret-output",
    }),
    ruleId: metaForMatch.id,
    title: metaForMatch.title,
    message:
      match.identifier === undefined
        ? "Potential credential material detected; its value has been redacted."
        : `Potential credential assigned to \`${match.identifier}\`; its value has been redacted.`,
    severity: metaForMatch.defaultSeverity,
    confidence: metaForMatch.defaultConfidence,
    category: "secrets",
    location,
    evidence: [
      {
        message: "Credential evidence redacted to prevent secret disclosure.",
        location,
        sinkKind: "secret-output",
      },
    ],
    standards: metaForMatch.standards,
    sinkKind: "secret-output",
    suggestion:
      "Move the credential to a secret manager or environment configuration and rotate it if it is real.",
  };
}

function stringValue(node: TSESTree.Node): string | undefined {
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}
function propertyName(node: TSESTree.Node): string | undefined {
  return node.type === "Identifier" ? node.name : stringValue(node);
}
function isPlaceholder(value: string): boolean {
  return (
    PLACEHOLDER.test(value) ||
    /^(?:YOUR|EXAMPLE|TEST|DUMMY|FAKE)_(?:API_)?(?:KEY|TOKEN|SECRET|PASSWORD)$/i.test(
      value,
    ) ||
    value.length < 8
  );
}
function isDatabasePlaceholder(value: string): boolean {
  return /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/USER:PASSWORD@HOST(?:\/DATABASE)?$/i.test(
    value,
  );
}
function isEnvironmentReference(value: string): boolean {
  return /^\$\{(?:process\.)?env\.[A-Z0-9_]+\}$/.test(value);
}
function hasSecretQuery(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) &&
    /[?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=/i.test(
      value,
    )
  );
}
function isClientCode(context: SecurityRuleContext): boolean {
  return (
    /\.(?:tsx?|jsx?)$/.test(context.file) &&
    (/^\s*["']use client["']/m.test(context.source) ||
      /(?:window|document|localStorage)\b/.test(context.source))
  );
}
function isExcludedContext(file: string): boolean {
  return /^(?:docs\/|tests\/fixtures\/)/i.test(file);
}
function isKnownToken(value: string): boolean {
  return /^(?:ghp|github_pat|xox[baprs]|AKIA)[-_][A-Za-z0-9_-]{8,}$/.test(
    value,
  );
}
function hasCredentialEntropy(value: string): boolean {
  return (
    value.length >= 20 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    !/\s/.test(value)
  );
}
function isLogCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "console" &&
    callee.property.type === "Identifier" &&
    /^(?:log|info|warn|error|debug)$/.test(callee.property.name)
  );
}
function referencesSecret(
  node: unknown,
  bindings: ReadonlySet<string>,
): boolean {
  if (!isNode(node)) return false;
  return (
    (node.type === "Identifier" && bindings.has(node.name)) ||
    (node.type === "Literal" &&
      typeof node.value === "string" &&
      (PRIVATE_KEY.test(node.value) ||
        JWT.test(node.value) ||
        API_KEY_PREFIX.test(node.value)))
  );
}
function locationOf(
  node: TSESTree.Node,
  file: string,
): SecurityFinding["location"] {
  return {
    path: file,
    line: node.loc?.start.line,
    column: node.loc?.start.column,
    range:
      node.range === undefined
        ? undefined
        : { start: node.range[0], end: node.range[1] },
  };
}
function unique(matches: readonly SecretMatch[]): readonly SecretMatch[] {
  const keys = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.kind}:${match.node.range?.join("-") ?? ""}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}
function visit(
  node: TSESTree.Node,
  visitor: (node: TSESTree.Node) => void,
): void {
  visitor(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) visit(value, visitor);
    else if (Array.isArray(value))
      for (const item of value) if (isNode(item)) visit(item, visitor);
  }
}
function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}
