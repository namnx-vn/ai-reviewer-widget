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
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../../model/types";
import {
  classifySensitiveDataNode,
  isSensitiveInputAccess,
  isSensitiveRedactionCall,
  toSensitiveTaintKinds,
  type SensitiveDataClassification,
} from "../data";

type LoggingKind = "secret" | "credential" | "payment-data" | "pii";
type ErrorKind = "stacktrace-exposure" | "internal-detail" | "database-detail";
type RuleKind = LoggingKind | ErrorKind;

interface StructuralMatch {
  readonly kind: ErrorKind;
  readonly node: TSESTree.CallExpression;
  readonly evidence: string;
}

const METAS: Readonly<Record<RuleKind, SecurityRuleMeta>> = {
  secret: meta("security.logging.secret", "Secret written to logs", "high", "high", "CWE-532", "logging"),
  credential: meta("security.logging.credential", "Credential written to logs", "critical", "high", "CWE-532", "logging"),
  "payment-data": meta("security.logging.payment-data", "Payment data written to logs", "critical", "high", "CWE-532", "logging"),
  pii: meta("security.logging.pii", "PII written to logs", "high", "high", "CWE-532", "logging"),
  "stacktrace-exposure": meta("security.error.stacktrace-exposure", "Stack trace exposed to a client", "high", "high", "CWE-209", "logging"),
  "internal-detail": meta("security.error.internal-detail", "Internal error detail exposed to a client", "medium", "high", "CWE-209", "logging"),
  "database-detail": meta("security.error.database-detail", "Database error detail exposed to a client", "high", "high", "CWE-209", "logging"),
};

export const loggingErrorRules: readonly SecurityRule[] = (Object.keys(METAS) as RuleKind[]).map((kind) => ({
  meta: METAS[kind],
  check(context) {
    if (isLoggingKind(kind)) {
      return analyzeInterproceduralTaint(context.ast, context.file, createLoggingAdapter(kind))
        .filter((match) => match.sink.label === "Security-sensitive logging sink")
        .map((match) => flowFinding(context, kind, match));
    }

    return collectErrorMatches(context.ast)
      .filter((match) => match.kind === kind)
      .map((match) => structuralFinding(context, match));
  },
}));

function meta(
  id: string,
  title: string,
  severity: SecurityRuleMeta["defaultSeverity"],
  confidence: SecurityRuleMeta["defaultConfidence"],
  cwe: string,
  category: SecurityRuleMeta["category"],
): SecurityRuleMeta {
  return {
    id,
    title,
    description: `${title}; sensitive values and internal error content are never copied into analyzer output.`,
    category,
    defaultSeverity: severity,
    defaultConfidence: confidence,
    standards: [{ standard: "cwe", id: cwe }],
  };
}

function isLoggingKind(kind: RuleKind): kind is LoggingKind {
  return kind === "secret" || kind === "credential" || kind === "payment-data" || kind === "pii";
}

function createLoggingAdapter(classification: SensitiveDataClassification): TaintFlowAdapter {
  return {
    matchSource(node): TaintSource | undefined {
      if (!isSensitiveInputAccess(node)) return undefined;
      const classifications = classifySensitiveDataNode(node);
      if (!classifications.includes(classification)) return undefined;
      const kinds = toSensitiveTaintKinds([classification]);
      return { node, label: `Classified ${classification} data`, sourceKind: "request-input", kinds };
    },
    matchSanitizer(node): TaintSanitizer | undefined {
      if (!isSensitiveRedactionCall(node)) return undefined;
      return { node, label: "Sensitive data redaction", sanitizerKind: "unknown", clears: ["secret", "credential", "payment-data"], argumentIndex: 0 };
    },
    matchSinks(node): readonly TaintSink[] {
      if (node.type !== "CallExpression" || !isLogCall(node.callee)) return [];
      return node.arguments.flatMap((argument): readonly TaintSink[] => {
        if (argument.type === "SpreadElement") return [];
        return toSensitiveTaintKinds([classification]).map((family) => ({
          family,
          node,
          value: argument,
          label: "Security-sensitive logging sink",
          sinkKind: "secret-output",
        }));
      });
    },
  };
}

function isLogCall(callee: TSESTree.Expression | TSESTree.Super): boolean {
  const name = calleeName(callee);
  return /^(?:console|logger|log|pino|winston)\.(?:log|info|warn|error|debug|trace|fatal)$/.test(name);
}

function collectErrorMatches(ast: TSESTree.Program): readonly StructuralMatch[] {
  const matches: StructuralMatch[] = [];
  visit(ast, (node) => {
    if (node.type !== "CallExpression" || !isClientResponseCall(node.callee)) return;
    const payload = expressionArgument(node, 0);
    if (payload === undefined) return;

    if (containsErrorProperty(payload, new Set(["stack", "stackTrace"]))) {
      matches.push({ kind: "stacktrace-exposure", node, evidence: "A client response contains an error stack trace." });
    }
    if (containsErrorProperty(payload, new Set(["sql", "query", "constraint", "driverError", "detail"]))) {
      matches.push({ kind: "database-detail", node, evidence: "A client response contains database-specific error detail." });
    }
    if (containsErrorProperty(payload, new Set(["message", "cause", "name"]))) {
      matches.push({ kind: "internal-detail", node, evidence: "A client response contains an internal error object property." });
    }
  });
  return uniqueStructural(matches);
}

function isClientResponseCall(callee: TSESTree.Expression | TSESTree.Super): boolean {
  const name = calleeName(callee);
  return /^(?:res|response|reply|NextResponse|Response)(?:\.[A-Za-z_$][\w$]*\([^)]*\))?\.(?:json|send|end)$/.test(name)
    || /^(?:res|response|reply|NextResponse|Response)\.(?:json|send|end)$/.test(name)
    || /^(?:NextResponse|Response)\.json$/.test(name);
}

function containsErrorProperty(node: TSESTree.Node, properties: ReadonlySet<string>): boolean {
  let found = false;
  visit(node, (child) => {
    if (child.type !== "MemberExpression") return;
    const property = memberPropertyName(child);
    if (property === undefined || !properties.has(property)) return;
    const root = memberRoot(child);
    if (root !== undefined && /^(?:err|error|cause|exception|dbError|databaseError)$/i.test(root)) found = true;
  });
  return found;
}

function memberRoot(node: TSESTree.MemberExpression): string | undefined {
  let current: TSESTree.Node = node.object;
  while (current.type === "MemberExpression") current = current.object;
  return current.type === "Identifier" ? current.name : undefined;
}

function memberPropertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
  return undefined;
}

function expressionArgument(node: TSESTree.CallExpression, index: number): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement" ? undefined : argument;
}

function calleeName(node: TSESTree.Node): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "CallExpression") return calleeName(node.callee);
  if (node.type === "MemberExpression") {
    const property = memberPropertyName(node);
    const object = calleeName(node.object);
    return property === undefined || object.length === 0 ? "" : `${object}.${property}`;
  }
  return "";
}

function flowFinding(context: SecurityRuleContext, kind: LoggingKind, match: TaintFlowMatch): SecurityFinding {
  const metaForKind = METAS[kind];
  const location = locationOf(match.sink.node, context.file);
  return {
    id: createSecurityFindingId({ ruleId: metaForKind.id, path: context.file, range: location.range, sinkKind: "secret-output" }),
    ruleId: metaForKind.id,
    title: metaForKind.title,
    message: metaForKind.description,
    severity: metaForKind.defaultSeverity,
    confidence: metaForKind.defaultConfidence,
    category: "logging",
    location,
    evidence: [
      { message: `Classified ${kind} data reaches a logging boundary.`, sourceKind: "request-input" },
      { message: "Logging boundary receives classified data.", location, sinkKind: "secret-output" },
    ],
    flow: match.flow,
    standards: metaForKind.standards,
    sinkKind: "secret-output",
    suggestion: "Remove the field from logs or apply an approved redaction/masking function before logging.",
  };
}

function structuralFinding(context: SecurityRuleContext, match: StructuralMatch): SecurityFinding {
  const metaForKind = METAS[match.kind];
  const location = locationOf(match.node, context.file);
  return {
    id: createSecurityFindingId({ ruleId: metaForKind.id, path: context.file, range: location.range, sinkKind: "secret-output" }),
    ruleId: metaForKind.id,
    title: metaForKind.title,
    message: metaForKind.description,
    severity: metaForKind.defaultSeverity,
    confidence: metaForKind.defaultConfidence,
    category: "logging",
    location,
    evidence: [{ message: match.evidence, location, sinkKind: "secret-output" }],
    standards: metaForKind.standards,
    sinkKind: "secret-output",
    suggestion: "Return a stable generic error response and keep internal diagnostics only in protected server-side telemetry.",
  };
}

function locationOf(node: TSESTree.Node, path: string): SecurityFinding["location"] {
  return {
    path,
    line: node.loc?.start.line,
    column: node.loc?.start.column,
    range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] },
  };
}

function uniqueStructural(matches: readonly StructuralMatch[]): readonly StructuralMatch[] {
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
