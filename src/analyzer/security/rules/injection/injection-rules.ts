import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import {
  analyzeIntraproceduralTaint,
  type TaintFlowMatch,
  type TaintKind,
} from "../../flow";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
  SecurityStandardMapping,
} from "../../model/types";
import { createInjectionFlowAdapter } from "./injection-model";

interface RuleDefinition {
  readonly family: TaintKind;
  readonly meta: SecurityRuleMeta;
  readonly message: string;
  readonly suggestion: string;
}

const DEFINITIONS: readonly RuleDefinition[] = [
  define(
    "command",
    "security.injection.command",
    "Command injection",
    "critical",
    "CWE-78",
    "Request-controlled data reaches a command interpreter.",
    "Use fixed executables and structured argument arrays; avoid shell command construction from request data.",
  ),
  define(
    "sql",
    "security.injection.sql",
    "SQL injection",
    "high",
    "CWE-89",
    "Request-controlled data reaches a SQL query text sink.",
    "Use parameterized queries or prepared statements; keep request data out of SQL text.",
  ),
  define(
    "nosql",
    "security.injection.nosql",
    "NoSQL injection",
    "high",
    "CWE-943",
    "Request-controlled data reaches a NoSQL query or operator sink.",
    "Validate query shape against an allowlisted schema and reject operator-bearing user objects.",
  ),
  define(
    "template",
    "security.injection.template",
    "Template injection",
    "high",
    "CWE-1336",
    "Request-controlled data is used as template source code.",
    "Use trusted static templates and pass user data only as template values.",
  ),
  define(
    "expression",
    "security.injection.expression",
    "Expression injection",
    "high",
    "CWE-917",
    "Request-controlled data reaches an expression interpreter.",
    "Replace runtime expression evaluation with an allowlisted parser or explicit dispatch table.",
  ),
  define(
    "crlf",
    "security.injection.crlf",
    "CRLF injection",
    "high",
    "CWE-113",
    "Request-controlled data reaches a response header value without CR/LF neutralization.",
    "Reject CR/LF characters or use a framework API that validates and encodes header values.",
  ),
  define(
    "header",
    "security.injection.header",
    "Header injection",
    "high",
    "CWE-113",
    "Request-controlled data controls a response header name.",
    "Allowlist response header names and keep request input out of header metadata.",
  ),
  define(
    "ldap",
    "security.injection.ldap",
    "LDAP injection",
    "high",
    "CWE-90",
    "Request-controlled data reaches an LDAP filter.",
    "Escape LDAP filter metacharacters with a modeled LDAP-specific encoder and validate allowed filter structure.",
  ),
  define(
    "xpath",
    "security.injection.xpath",
    "XPath injection",
    "high",
    "CWE-643",
    "Request-controlled data reaches an XPath expression.",
    "Use fixed XPath expressions and bind or safely encode user-controlled values.",
  ),
  define(
    "graphql",
    "security.injection.graphql",
    "GraphQL document injection",
    "high",
    "CWE-74",
    "Request-controlled data becomes a GraphQL operation document.",
    "Keep GraphQL documents static and pass request data through GraphQL variables.",
  ),
];

export const injectionRules: readonly SecurityRule[] =
  DEFINITIONS.map(createRule);

function define(
  family: TaintKind,
  id: string,
  title: string,
  severity: SecurityRuleMeta["defaultSeverity"],
  cwe: string,
  message: string,
  suggestion: string,
): RuleDefinition {
  const standards: readonly SecurityStandardMapping[] = [
    {
      standard: "cwe",
      id: cwe,
    },
  ];

  return {
    family,
    meta: {
      id,
      title,
      description: message,
      category: "injection",
      defaultSeverity: severity,
      defaultConfidence: "high",
      standards,
    },
    message,
    suggestion,
  };
}

function createRule(definition: RuleDefinition): SecurityRule {
  return {
    meta: definition.meta,
    check(context) {
      const adapter = createInjectionFlowAdapter(context.ast);
      return analyzeIntraproceduralTaint(context.ast, context.file, adapter)
        .filter((match) => match.family === definition.family)
        .map((match) => createFinding(context, definition, match));
    },
  };
}

function createFinding(
  context: SecurityRuleContext,
  definition: RuleDefinition,
  match: TaintFlowMatch,
): SecurityFinding {
  const location = getLocation(match.sink.node, context.file);
  const sourceStep = match.flow.find((step) => step.kind === "source");

  return {
    id: createSecurityFindingId({
      ruleId: definition.meta.id,
      path: context.file,
      range: location.range,
      sinkKind: match.sink.sinkKind,
    }),
    ruleId: definition.meta.id,
    title: definition.meta.title,
    message: definition.message,
    severity: definition.meta.defaultSeverity,
    confidence: definition.meta.defaultConfidence,
    category: definition.meta.category,
    location,
    evidence: [
      {
        message: sourceStep?.label ?? "Request-controlled source",
        location: sourceStep?.location,
        sourceKind: sourceStep?.sourceKind,
      },
      {
        message: `Injection sink: ${match.sink.label}`,
        location,
        sinkKind: match.sink.sinkKind,
      },
    ],
    flow: match.flow,
    standards: definition.meta.standards,
    sinkKind: match.sink.sinkKind,
    suggestion: definition.suggestion,
  };
}

function getLocation(
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
