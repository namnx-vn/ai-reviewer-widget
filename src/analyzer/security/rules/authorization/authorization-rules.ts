import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import {
  analyzeInterproceduralTaint,
  type TaintFlowAdapter,
  type TaintFlowMatch,
  type TaintSanitizer,
  type TaintSink,
  type TaintSource,
} from "../../flow";
import type {
  SecurityConfidence,
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../../model/types";

type AuthorizationKind =
  | "client-side-only"
  | "role-from-untrusted-input"
  | "permission-from-untrusted-input"
  | "mass-assignment"
  | "missing-resource-ownership"
  | "idor-candidate"
  | "privilege-escalation";

interface Match {
  readonly kind: AuthorizationKind;
  readonly node: TSESTree.Node;
  readonly evidence: string;
  readonly confidence?: SecurityConfidence;
  readonly flow?: TaintFlowMatch["flow"];
}

const METAS: Readonly<Record<AuthorizationKind, SecurityRuleMeta>> = {
  "client-side-only": meta("security.authz.client-side-only", "Client-side-only authorization", "high", "high", "CWE-602"),
  "role-from-untrusted-input": meta("security.authz.role-from-untrusted-input", "Role derived from untrusted input", "high", "high", "CWE-269"),
  "permission-from-untrusted-input": meta("security.authz.permission-from-untrusted-input", "Permission derived from untrusted input", "high", "high", "CWE-269"),
  "mass-assignment": meta("security.authz.mass-assignment", "Mass assignment of request-controlled fields", "high", "high", "CWE-915"),
  "missing-resource-ownership": meta("security.authz.missing-resource-ownership", "Missing resource ownership enforcement", "high", "medium", "CWE-639"),
  "idor-candidate": meta("security.authz.idor-candidate", "Potential insecure direct object reference", "high", "medium", "CWE-639"),
  "privilege-escalation": meta("security.authz.privilege-escalation", "Request-controlled privilege escalation", "critical", "high", "CWE-269"),
};

export const authorizationRules: readonly SecurityRule[] = (Object.keys(METAS) as AuthorizationKind[]).map((kind) => ({
  meta: METAS[kind],
  check(context) {
    const matches = collectMatches(context).filter((match) => match.kind === kind);
    return matches.map((match) => createFinding(context, match));
  },
}));

function meta(
  id: string,
  title: string,
  severity: SecurityRuleMeta["defaultSeverity"],
  confidence: SecurityRuleMeta["defaultConfidence"],
  cwe: string,
): SecurityRuleMeta {
  return {
    id,
    title,
    description: `${title} is detected from explicit authorization semantics and data-flow evidence.`,
    category: "authorization",
    defaultSeverity: severity,
    defaultConfidence: confidence,
    standards: [{ standard: "cwe", id: cwe }],
  };
}

function collectMatches(context: SecurityRuleContext): readonly Match[] {
  const matches: Match[] = [];
  const adapter = createAuthorizationAdapter();
  for (const flow of analyzeInterproceduralTaint(context.ast, context.file, adapter)) {
    if (flow.family !== "user-input") continue;
    const label = flow.sink.label;
    if (label === "Authorization role sink") {
      matches.push({ kind: "role-from-untrusted-input", node: flow.sink.node, evidence: "Request-controlled data reaches a role authorization sink.", flow: flow.flow });
    }
    if (label === "Authorization permission sink") {
      matches.push({ kind: "permission-from-untrusted-input", node: flow.sink.node, evidence: "Request-controlled data reaches a permission authorization sink.", flow: flow.flow });
    }
  }

  visit(context.ast, (node) => {
    if (node.type === "IfStatement" && isClientAuthorizationDecision(context.source, node)) {
      matches.push({ kind: "client-side-only", node, evidence: "A browser-controlled role or permission value gates an authorization-sensitive branch." });
    }
    if (node.type === "CallExpression") {
      inspectMutation(node, context.source, matches);
      inspectResourceAccess(node, context.source, matches);
    }
  });

  return unique(matches);
}

function createAuthorizationAdapter(): TaintFlowAdapter {
  return {
    matchSource(node): TaintSource | undefined {
      if (!isRequestInput(node)) return undefined;
      return {
        node,
        label: "Request-controlled authorization input",
        sourceKind: "request-input",
        kinds: ["user-input"],
      };
    },
    matchSanitizer(node): TaintSanitizer | undefined {
      if (node.callee.type !== "Identifier") return undefined;
      if (!new Set(["assertTrustedRole", "assertAllowedRole", "assertTrustedPermission", "assertAllowedPermission"]).has(node.callee.name)) return undefined;
      return {
        node,
        label: "Authorization allowlist validation",
        sanitizerKind: "schema-validation",
        clears: ["user-input"],
        argumentIndex: 0,
      };
    },
    matchSinks(node): readonly TaintSink[] {
      if (node.type === "AssignmentExpression") {
        const property = memberPropertyName(node.left);
        if (property === "role") return [sink(node, node.right, "Authorization role sink")];
        if (property === "permission" || property === "permissions") return [sink(node, node.right, "Authorization permission sink")];
      }
      if (node.type === "Property") {
        const property = propertyName(node.key);
        if (property === "role") return [sink(node, node.value, "Authorization role sink")];
        if (property === "permission" || property === "permissions") return [sink(node, node.value, "Authorization permission sink")];
      }
      return [];
    },
  };
}

function sink(node: TSESTree.Node, value: TSESTree.Node, label: string): TaintSink {
  return { family: "user-input", node, value, label, sinkKind: "unknown" };
}

function inspectMutation(node: TSESTree.CallExpression, source: string, matches: Match[]): void {
  if (!isMutationCall(node.callee)) return;
  const payload = mutationPayload(node);
  if (payload === undefined) return;

  if (isDirectRequestObject(payload) || containsRequestSpread(payload)) {
    matches.push({
      kind: "mass-assignment",
      node,
      evidence: "A request-controlled object is passed directly into a persistence mutation without an explicit field allowlist.",
    });
  }

  if (containsUntrustedPrivilegeField(payload)) {
    matches.push({
      kind: "privilege-escalation",
      node,
      evidence: "A persistence mutation accepts a request-controlled role or permission field.",
    });
  }

  if (isResourceMutation(node.callee) && hasRequestControlledIdentifier(node) && !hasOwnershipEnforcement(source)) {
    matches.push({
      kind: "missing-resource-ownership",
      node,
      evidence: "A resource mutation uses a request-controlled identifier and no explicit principal-to-resource ownership check is visible in this analysis unit.",
      confidence: "medium",
    });
  }
}

function inspectResourceAccess(node: TSESTree.CallExpression, source: string, matches: Match[]): void {
  if (!isResourceLookup(node.callee) || !hasRequestControlledIdentifier(node) || hasOwnershipEnforcement(source)) return;
  matches.push({
    kind: "idor-candidate",
    node,
    evidence: "A resource is selected by a request-controlled identifier without a visible ownership or authorization predicate; this is a candidate because enforcement may exist outside the analyzed context.",
    confidence: "medium",
  });
}

function isClientAuthorizationDecision(source: string, node: TSESTree.IfStatement): boolean {
  const clientBoundary = /^\s*["']use client["']/m.test(source) || /\b(?:localStorage|sessionStorage)\b/.test(source);
  if (!clientBoundary) return false;
  const test = JSON.stringify(node.test);
  if (!/(?:role|permission|permissions|isAdmin|canEdit|canDelete)/i.test(test)) return false;
  return /(?:localStorage|sessionStorage|window|document|user|session)/i.test(test);
}

function isRequestInput(node: TSESTree.Node): boolean {
  if (node.type !== "MemberExpression") return false;
  let root: TSESTree.Node = node.object;
  while (root.type === "MemberExpression") root = root.object;
  return root.type === "Identifier" && new Set(["req", "request", "ctx", "input"]).has(root.name);
}

function isDirectRequestObject(node: TSESTree.Node): boolean {
  if (node.type !== "MemberExpression") return false;
  const property = memberPropertyName(node);
  if (property !== "body") return false;
  return isRequestInput(node);
}

function containsRequestSpread(node: TSESTree.Node): boolean {
  if (node.type !== "ObjectExpression") return false;
  return node.properties.some((property) => property.type === "SpreadElement" && (isDirectRequestObject(property.argument) || isRequestInput(property.argument)));
}

function containsUntrustedPrivilegeField(node: TSESTree.Node): boolean {
  if (node.type === "MemberExpression") {
    const property = memberPropertyName(node);
    return isRequestInput(node) && isPrivilegeName(property);
  }
  if (node.type !== "ObjectExpression") return false;
  return node.properties.some((property) => {
    if (property.type === "SpreadElement") return isDirectRequestObject(property.argument) || isRequestInput(property.argument);
    if (property.type !== "Property") return false;
    const name = propertyName(property.key);
    return isPrivilegeName(name) && containsRequestInput(property.value);
  });
}

function containsRequestInput(node: TSESTree.Node): boolean {
  let found = false;
  visit(node, (child) => { if (isRequestInput(child)) found = true; });
  return found;
}

function hasRequestControlledIdentifier(node: TSESTree.CallExpression): boolean {
  return node.arguments.some((argument) => argument.type !== "SpreadElement" && containsRequestInput(argument));
}

function hasOwnershipEnforcement(source: string): boolean {
  return /(?:ownerId|userId|accountId|customerId|tenantId)\s*(?::|===|==)\s*(?:req\.(?:user|auth|session)|request\.(?:user|auth|session)|ctx\.(?:user|auth|session)|principal|session|user)\b/i.test(source)
    || /(?:assert|require|verify|check)(?:Resource)?Ownership\s*\(/i.test(source)
    || /(?:authorize|canAccess|hasPermission)\s*\(/i.test(source);
}

function mutationPayload(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const first = node.arguments[0];
  if (first === undefined || first.type === "SpreadElement") return undefined;
  if (first.type === "ObjectExpression") {
    for (const property of first.properties) {
      if (property.type !== "Property") continue;
      const name = propertyName(property.key);
      if ((name === "data" || name === "update" || name === "$set") && property.value.type !== "SpreadElement") return property.value;
    }
  }
  return first;
}

function isMutationCall(node: TSESTree.Expression | TSESTree.Super): boolean {
  const name = calleeName(node);
  return /(?:^|\.)(?:create|update|updateOne|updateMany|findByIdAndUpdate|save|insert|replaceOne)$/.test(name);
}

function isResourceMutation(node: TSESTree.Expression | TSESTree.Super): boolean {
  const name = calleeName(node);
  return /(?:update|delete|remove|destroy|findByIdAndUpdate|findOneAndUpdate)/i.test(name);
}

function isResourceLookup(node: TSESTree.Expression | TSESTree.Super): boolean {
  const name = calleeName(node);
  return /(?:findById|findUnique|findFirst|findOne|getById|loadById|fetchById)$/i.test(name);
}

function calleeName(node: TSESTree.Expression | TSESTree.Super): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") {
    const property = memberPropertyName(node);
    return property === undefined ? "" : `${calleeName(node.object)}.${property}`;
  }
  return "";
}

function memberPropertyName(node: TSESTree.Node): string | undefined {
  if (node.type !== "MemberExpression") return undefined;
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  return node.computed && node.property.type === "Literal" && typeof node.property.value === "string" ? node.property.value : undefined;
}

function propertyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function isPrivilegeName(name: string | undefined): boolean {
  return name === "role" || name === "permission" || name === "permissions" || name === "isAdmin" || name === "isSuperuser";
}

function createFinding(context: SecurityRuleContext, match: Match): SecurityFinding {
  const meta = METAS[match.kind];
  const location = {
    path: context.file,
    line: match.node.loc?.start.line,
    column: match.node.loc?.start.column,
    range: match.node.range === undefined ? undefined : { start: match.node.range[0], end: match.node.range[1] },
  };
  return {
    id: createSecurityFindingId({ ruleId: meta.id, path: context.file, range: location.range, sinkKind: "unknown" }),
    ruleId: meta.id,
    title: meta.title,
    message: meta.description,
    severity: meta.defaultSeverity,
    confidence: match.confidence ?? meta.defaultConfidence,
    category: "authorization",
    location,
    evidence: [{ message: match.evidence, location }],
    flow: match.flow,
    standards: meta.standards,
    suggestion: remediation(match.kind),
  };
}

function remediation(kind: AuthorizationKind): string {
  if (kind === "client-side-only") return "Enforce the authorization decision on the server using an authenticated principal and trusted policy data.";
  if (kind === "mass-assignment" || kind === "privilege-escalation") return "Map an explicit allowlist of mutable fields and never accept role or permission fields from untrusted request objects.";
  if (kind === "missing-resource-ownership" || kind === "idor-candidate") return "Bind resource selection to the authenticated principal or perform an explicit ownership/permission check before access.";
  return "Derive roles and permissions from trusted server-side identity or policy state, not request-controlled values.";
}

function unique(matches: readonly Match[]): readonly Match[] {
  return matches.filter((match, index) => matches.findIndex((candidate) => candidate.kind === match.kind && candidate.node.range?.[0] === match.node.range?.[0]) === index);
}

function visit(node: TSESTree.Node, callback: (node: TSESTree.Node) => void): void {
  callback(node);
  for (const value of Object.values(node)) {
    if (value === null || typeof value !== "object" || value === node.parent) continue;
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) visit(child, callback);
    } else if (isNode(value)) visit(value, callback);
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}
