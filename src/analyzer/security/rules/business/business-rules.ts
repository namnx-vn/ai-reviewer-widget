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

type BusinessKind =
  | "client-controlled-fee"
  | "client-controlled-balance"
  | "client-controlled-authority"
  | "transaction-idempotency"
  | "transaction-replay-risk"
  | "workflow-bypass"
  | "unvalidated-transaction-amount";

type FlowKind = Exclude<BusinessKind, "transaction-idempotency" | "transaction-replay-risk">;

interface CandidateMatch {
  readonly kind: "transaction-idempotency" | "transaction-replay-risk";
  readonly node: TSESTree.CallExpression;
  readonly evidence: string;
}

const METAS: Readonly<Record<BusinessKind, SecurityRuleMeta>> = {
  "client-controlled-fee": meta("security.business.client-controlled-fee", "Client-controlled transaction fee", "high", "high", "CWE-602"),
  "client-controlled-balance": meta("security.business.client-controlled-balance", "Client-controlled account balance", "critical", "high", "CWE-602"),
  "client-controlled-authority": meta("security.business.client-controlled-authority", "Client-controlled transaction authority", "critical", "high", "CWE-269"),
  "transaction-idempotency": meta("security.business.transaction-idempotency", "Transaction lacks visible idempotency protection", "high", "medium", "CWE-841"),
  "transaction-replay-risk": meta("security.business.transaction-replay-risk", "Transaction replay risk", "high", "medium", "CWE-294"),
  "workflow-bypass": meta("security.business.workflow-bypass", "Request-controlled workflow transition", "critical", "high", "CWE-841"),
  "unvalidated-transaction-amount": meta("security.business.unvalidated-transaction-amount", "Unvalidated transaction amount", "high", "high", "CWE-20"),
};

export const businessSecurityRules: readonly SecurityRule[] = (Object.keys(METAS) as BusinessKind[]).map((kind) => ({
  meta: METAS[kind],
  check(context) {
    if (kind === "transaction-idempotency" || kind === "transaction-replay-risk") {
      return collectCandidateMatches(context)
        .filter((match) => match.kind === kind)
        .map((match) => candidateFinding(context, match));
    }

    return analyzeInterproceduralTaint(context.ast, context.file, createBusinessAdapter(kind))
      .filter((match) => match.sink.label === sinkLabel(kind))
      .map((match) => flowFinding(context, kind, match));
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
    description: `${title} is detected only at an explicit banking-domain operation boundary.`,
    category: "business",
    defaultSeverity: severity,
    defaultConfidence: confidence,
    standards: [{ standard: "cwe", id: cwe }],
  };
}

function createBusinessAdapter(kind: FlowKind): TaintFlowAdapter {
  return {
    matchSource(node): TaintSource | undefined {
      if (!isRequestInput(node)) return undefined;
      return {
        node,
        label: "Request-controlled business input",
        sourceKind: "request-input",
        kinds: ["user-input"],
      };
    },
    matchSanitizer(node): TaintSanitizer | undefined {
      const name = calleeName(node.callee);
      if (!isSanitizerFor(kind, name)) return undefined;
      return {
        node,
        label: sanitizerLabel(kind),
        sanitizerKind: "schema-validation",
        clears: ["user-input"],
        argumentIndex: 0,
      };
    },
    matchSinks(node): readonly TaintSink[] {
      if (node.type !== "CallExpression" || !isBankingOperation(node.callee)) return [];
      const value = namedBusinessValue(node, sinkProperties(kind));
      if (value === undefined) return [];
      return [{ family: "user-input", node, value, label: sinkLabel(kind), sinkKind: "unknown" }];
    },
  };
}

function sinkProperties(kind: FlowKind): ReadonlySet<string> {
  if (kind === "client-controlled-fee") return new Set(["fee", "feeAmount", "serviceFee"]);
  if (kind === "client-controlled-balance") return new Set(["balance", "availableBalance", "ledgerBalance"]);
  if (kind === "client-controlled-authority") return new Set(["authority", "approvalLevel", "approvedBy", "limitOverride"]);
  if (kind === "workflow-bypass") return new Set(["status", "state", "decision", "transition"]);
  return new Set(["amount", "transactionAmount", "transferAmount", "paymentAmount"]);
}

function isSanitizerFor(kind: FlowKind, name: string): boolean {
  if (kind === "client-controlled-fee") return /(?:^|\.)(?:calculateFee|computeFee|deriveFee)$/.test(name);
  if (kind === "client-controlled-authority") return /(?:^|\.)(?:deriveAuthority|requireApproval|authorizeAuthority)$/.test(name);
  if (kind === "workflow-bypass") return /(?:^|\.)(?:assertValidTransition|requireApproval|authorizeTransition)$/.test(name);
  if (kind === "unvalidated-transaction-amount") return /(?:^|\.)(?:validateAmount|assertValidAmount|normalizeAmount|parseMoney|toMinorUnits)$/.test(name) || name === "Money.from";
  return false;
}

function sanitizerLabel(kind: FlowKind): string {
  if (kind === "client-controlled-fee") return "Server-side fee calculation";
  if (kind === "client-controlled-authority") return "Trusted authority derivation";
  if (kind === "workflow-bypass") return "Workflow transition validation";
  if (kind === "unvalidated-transaction-amount") return "Transaction amount validation/normalization";
  return "Business input validation";
}

function sinkLabel(kind: FlowKind): string {
  if (kind === "client-controlled-fee") return "Transaction fee boundary";
  if (kind === "client-controlled-balance") return "Account balance boundary";
  if (kind === "client-controlled-authority") return "Transaction authority boundary";
  if (kind === "workflow-bypass") return "Privileged workflow transition boundary";
  return "Transaction amount boundary";
}

function namedBusinessValue(node: TSESTree.CallExpression, names: ReadonlySet<string>): TSESTree.Node | undefined {
  for (const argument of node.arguments) {
    if (argument.type !== "ObjectExpression") continue;
    for (const property of argument.properties) {
      if (property.type !== "Property") continue;
      const name = propertyName(property.key);
      if (name !== undefined && names.has(name)) return property.value;
    }
  }
  return undefined;
}

function collectCandidateMatches(context: SecurityRuleContext): readonly CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  visit(context.ast, (node) => {
    if (node.type !== "CallExpression" || !isTransactionMutation(node.callee)) return;
    if (!containsRequestInput(node)) return;

    if (!hasIdempotencyEvidence(node, context.source)) {
      matches.push({
        kind: "transaction-idempotency",
        node,
        evidence: "A request-controlled transaction mutation has no visible idempotency key or deduplication guard in this analysis unit.",
      });
    }

    if (containsDirectRequestPayload(node) && !hasReplayEvidence(context.source)) {
      matches.push({
        kind: "transaction-replay-risk",
        node,
        evidence: "A transaction mutation consumes a request/event payload directly with no visible nonce, replay, or deduplication guard.",
      });
    }
  });
  return uniqueCandidates(matches);
}

function isBankingOperation(callee: TSESTree.Expression | TSESTree.Super): boolean {
  const name = calleeName(callee);
  return /(?:^|\.)(?:createTransaction|submitTransaction|executeTransaction|processPayment|createPayment|charge|transfer|createTransfer|submitTransfer|executeTransfer|debit|credit|updateBalance|setBalance|authorizeTransaction|transitionTransaction|updateTransactionStatus|approveTransaction|settleTransaction|releaseFunds)$/.test(name);
}

function isTransactionMutation(callee: TSESTree.Expression | TSESTree.Super): boolean {
  const name = calleeName(callee);
  return /(?:^|\.)(?:createTransaction|submitTransaction|executeTransaction|processPayment|createPayment|charge|transfer|createTransfer|submitTransfer|executeTransfer|debit|credit|settleTransaction|releaseFunds)$/.test(name);
}

function containsRequestInput(node: TSESTree.Node): boolean {
  let found = false;
  visit(node, (child) => {
    if (isRequestInput(child)) found = true;
  });
  return found;
}

function containsDirectRequestPayload(node: TSESTree.CallExpression): boolean {
  return node.arguments.some((argument) => argument.type !== "SpreadElement" && isDirectRequestPayload(argument));
}

function isDirectRequestPayload(node: TSESTree.Node): boolean {
  if (node.type !== "MemberExpression") return false;
  const property = memberPropertyName(node);
  if (property !== "body" && property !== "detail" && property !== "data") return false;
  return isRequestInput(node);
}

function hasIdempotencyEvidence(node: TSESTree.CallExpression, source: string): boolean {
  if (/(?:idempotencyKey|idempotency-key|dedupeKey|requestId)/i.test(JSON.stringify(node))) return true;
  return /(?:assert|require|check|reserve)(?:Idempotency|Idempotent|Dedupe)|idempotency(?:Store|Cache)|dedupeTransaction/i.test(source);
}

function hasReplayEvidence(source: string): boolean {
  return /(?:nonce|replay(?:Guard|Protection)|dedupe(?:Event|Transaction)|processedEvent|eventIdempotency|verifyEventSignature)/i.test(source);
}

function isRequestInput(node: TSESTree.Node): boolean {
  if (node.type !== "MemberExpression") return false;
  let root: TSESTree.Node = node.object;
  while (root.type === "MemberExpression") root = root.object;
  return root.type === "Identifier" && /^(?:req|request|ctx|event|input)$/.test(root.name);
}

function propertyName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return undefined;
}

function memberPropertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
  return undefined;
}

function calleeName(node: TSESTree.Node): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") {
    const object = calleeName(node.object);
    const property = memberPropertyName(node);
    return object.length === 0 || property === undefined ? "" : `${object}.${property}`;
  }
  return "";
}

function flowFinding(context: SecurityRuleContext, kind: FlowKind, match: TaintFlowMatch): SecurityFinding {
  const metaForKind = METAS[kind];
  const location = locationOf(match.sink.node, context.file);
  return {
    id: createSecurityFindingId({ ruleId: metaForKind.id, path: context.file, range: location.range, sinkKind: "unknown" }),
    ruleId: metaForKind.id,
    title: metaForKind.title,
    message: metaForKind.description,
    severity: metaForKind.defaultSeverity,
    confidence: metaForKind.defaultConfidence,
    category: "business",
    location,
    evidence: [
      { message: "Request-controlled data reaches a modeled banking-domain operation.", sourceKind: "request-input" },
      { message: match.sink.label, location, sinkKind: "unknown" },
    ],
    flow: match.flow,
    standards: metaForKind.standards,
    suggestion: remediation(kind),
  };
}

function candidateFinding(context: SecurityRuleContext, match: CandidateMatch): SecurityFinding {
  const metaForKind = METAS[match.kind];
  const location = locationOf(match.node, context.file);
  return {
    id: createSecurityFindingId({ ruleId: metaForKind.id, path: context.file, range: location.range, sinkKind: "unknown" }),
    ruleId: metaForKind.id,
    title: metaForKind.title,
    message: metaForKind.description,
    severity: metaForKind.defaultSeverity,
    confidence: "medium" satisfies SecurityConfidence,
    category: "business",
    location,
    evidence: [{ message: match.evidence, location }],
    standards: metaForKind.standards,
    suggestion: remediation(match.kind),
  };
}

function remediation(kind: BusinessKind): string {
  if (kind === "client-controlled-fee") return "Calculate transaction fees from trusted server-side pricing policy.";
  if (kind === "client-controlled-balance") return "Derive balances from authoritative ledger state; never accept a client-supplied balance.";
  if (kind === "client-controlled-authority") return "Derive approval authority from authenticated server-side policy and entitlements.";
  if (kind === "transaction-idempotency" || kind === "transaction-replay-risk") return "Use a server-verified idempotency/replay key with atomic deduplication around the transaction boundary.";
  if (kind === "workflow-bypass") return "Validate allowed state transitions and authorization before privileged workflow changes.";
  return "Validate amount bounds/currency and normalize monetary values before transaction execution.";
}

function locationOf(node: TSESTree.Node, path: string): SecurityFinding["location"] {
  return { path, line: node.loc?.start.line, column: node.loc?.start.column, range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] } };
}

function uniqueCandidates(matches: readonly CandidateMatch[]): readonly CandidateMatch[] {
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
