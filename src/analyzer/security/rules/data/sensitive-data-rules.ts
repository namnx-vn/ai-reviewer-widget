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
} from "./sensitive-data-classification";

type DataRuleKind =
  | "log"
  | "url"
  | "storage"
  | "telemetry"
  | "analytics"
  | "error"
  | "persistence"
  | "clipboard";

interface Definition {
  readonly kind: DataRuleKind;
  readonly meta: SecurityRuleMeta;
  readonly message: string;
  readonly suggestion: string;
}

const DEFINITIONS: readonly Definition[] = [
  define("log", "security.data.log-sensitive", "Sensitive data written to logs", "high", "CWE-532"),
  define("url", "security.data.url-sensitive", "Sensitive data included in URL", "high", "CWE-598"),
  define("storage", "security.data.client-storage-sensitive", "Sensitive data persisted in client storage", "high", "CWE-922"),
  define("telemetry", "security.data.telemetry-sensitive", "Sensitive data sent to telemetry", "high", "CWE-200"),
  define("analytics", "security.data.analytics-sensitive", "Sensitive data sent to analytics", "high", "CWE-200"),
  define("error", "security.data.error-sensitive", "Sensitive data included in an error", "medium", "CWE-209"),
  define("persistence", "security.data.unencrypted-persistence", "Sensitive data written to unencrypted persistence", "high", "CWE-311"),
  define("clipboard", "security.data.clipboard-sensitive", "Sensitive data copied to clipboard", "high", "CWE-200"),
];

/** Deterministic classifications are retained as taint labels; values are never rendered. */
export const sensitiveDataRules: readonly SecurityRule[] = DEFINITIONS.map((definition) => ({
  meta: definition.meta,
  check(context) {
    return analyzeInterproceduralTaint(context.ast, context.file, createAdapter())
      .filter((match) => match.sink.label === sinkLabel(definition.kind))
      .map((match) => createFinding(context, definition, match));
  },
}));

function define(kind: DataRuleKind, id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): Definition {
  return {
    kind,
    meta: { id, title, description: `${title}; sensitive values are redacted from analyzer output.`, category: "data", defaultSeverity: severity, defaultConfidence: "high", standards: [{ standard: "cwe", id: cwe }] },
    message: `${title}.`,
    suggestion: "Redact or remove sensitive fields before this exposure boundary.",
  };
}

function createAdapter(): TaintFlowAdapter {
  return {
    matchSource(node): TaintSource | undefined {
      if (!isSensitiveInputAccess(node)) return undefined;
      const classifications = classifySensitiveDataNode(node);
      const kinds = toSensitiveTaintKinds(classifications);
      if (kinds.length === 0) return undefined;
      return { node, label: `Sensitive ${classifications.join("/")} data`, sourceKind: "request-input", kinds };
    },
    matchSanitizer(node): TaintSanitizer | undefined {
      if (!isSensitiveRedactionCall(node)) return undefined;
      return { node, label: "Sensitive data redaction", sanitizerKind: "unknown", clears: ["secret", "credential", "payment-data"], argumentIndex: 0 };
    },
    matchSinks(node): readonly TaintSink[] { return sinks(node); },
  };
}

function sinks(node: TSESTree.Node): readonly TaintSink[] {
  if (node.type !== "CallExpression" && node.type !== "NewExpression") return [];
  const call = node;
  const callee = calleeName(call.callee);
  const argument = (index: number) => {
    const value = call.arguments[index];
    return value === undefined || value.type === "SpreadElement" ? undefined : value;
  };
  const sink = (kind: DataRuleKind, index: number): readonly TaintSink[] => {
    const value = argument(index);
    return value === undefined ? [] : (["secret", "credential", "payment-data"] as const).map((family) => ({ family, node, value, label: sinkLabel(kind), sinkKind: "secret-output" }));
  };
  if (/^(?:console\.(?:log|info|warn|error|debug)|logger\.(?:log|info|warn|error|debug))$/.test(callee)) return sink("log", 0);
  if (/^(?:fetch|axios\.(?:get|post|put|delete|request))$/.test(callee)) return sink("url", 0);
  if (/^(?:localStorage|sessionStorage)\.setItem$/.test(callee)) return sink("storage", 1);
  if (/^(?:Sentry|Datadog|telemetry)\.(?:captureMessage|captureException|track|event)$/.test(callee)) return sink("telemetry", 0);
  if (/^(?:analytics|mixpanel|segment)\.(?:track|identify|capture)$/.test(callee)) return sink("analytics", 1);
  if (node.type === "NewExpression" && /^(?:Error|TypeError|HttpError)$/.test(callee)) return sink("error", 0);
  if (/^(?:fs\.)?(?:writeFile|writeFileSync|appendFile|appendFileSync)$|^(?:database|db)\.(?:save|insert|create|update)$/.test(callee)) return sink("persistence", 1);
  if (callee === "navigator.clipboard.writeText") return sink("clipboard", 0);
  return [];
}

function sinkLabel(kind: DataRuleKind): string { return `Sensitive data ${kind === "storage" ? "client storage" : kind} sink`; }
function calleeName(node: TSESTree.Expression | TSESTree.Super): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") return `${calleeName(node.object)}.${node.property.name}`;
  return "";
}

function createFinding(context: SecurityRuleContext, definition: Definition, match: TaintFlowMatch): SecurityFinding {
  const node = match.sink.node;
  const location = { path: context.file, line: node.loc?.start.line, column: node.loc?.start.column, range: node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] } };
  return {
    id: createSecurityFindingId({ ruleId: definition.meta.id, path: context.file, range: location.range, sinkKind: match.sink.sinkKind }),
    ruleId: definition.meta.id, title: definition.meta.title, message: definition.message,
    severity: definition.meta.defaultSeverity, confidence: definition.meta.defaultConfidence, category: "data", location,
    evidence: [{ message: "Classified sensitive data reaches an exposure sink.", sourceKind: "request-input" }, { message: match.sink.label, location, sinkKind: match.sink.sinkKind }],
    flow: match.flow, standards: definition.meta.standards, sinkKind: match.sink.sinkKind, suggestion: definition.suggestion,
  };
}
