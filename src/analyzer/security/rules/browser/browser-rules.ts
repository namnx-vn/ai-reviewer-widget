import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../engine/finding-id";
import { analyzeInterproceduralTaint, type TaintFlowMatch } from "../../flow";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
  SecurityStandardMapping,
} from "../../model/types";
import {
  createBrowserFlowAdapter,
  findJavascriptUrlRisks,
  findWildcardPostMessageRisks,
  type BrowserFlowTarget,
  type BrowserStructuralMatch,
} from "./browser-model";

type BrowserRuleKind = BrowserFlowTarget | "javascript-url";

interface RuleDefinition {
  readonly kind: BrowserRuleKind;
  readonly meta: SecurityRuleMeta;
  readonly message: string;
  readonly suggestion: string;
}

const DEFINITIONS: readonly RuleDefinition[] = [
  define(
    "inner-html",
    "security.xss.inner-html",
    "Unsafe innerHTML assignment",
    "xss",
    "high",
    "CWE-79",
    "Browser-controlled data reaches an innerHTML assignment.",
    "Render text with textContent or sanitize HTML with a modeled HTML sanitizer before insertion.",
  ),
  define(
    "outer-html",
    "security.xss.outer-html",
    "Unsafe outerHTML assignment",
    "xss",
    "high",
    "CWE-79",
    "Browser-controlled data reaches an outerHTML assignment.",
    "Avoid outerHTML for untrusted content or sanitize the HTML with a modeled HTML sanitizer.",
  ),
  define(
    "document-write",
    "security.xss.document-write",
    "Unsafe document.write",
    "xss",
    "high",
    "CWE-79",
    "Browser-controlled data reaches document.write or document.writeln.",
    "Remove document.write and construct DOM nodes with safe text or sanitized markup.",
  ),
  define(
    "insert-adjacent-html",
    "security.xss.insert-adjacent-html",
    "Unsafe insertAdjacentHTML",
    "xss",
    "high",
    "CWE-79",
    "Browser-controlled data reaches insertAdjacentHTML.",
    "Prefer DOM APIs that do not parse HTML, or sanitize markup with a modeled HTML sanitizer.",
  ),
  define(
    "javascript-url",
    "security.xss.javascript-url",
    "JavaScript URL execution",
    "xss",
    "high",
    "CWE-79",
    "A javascript: URL is assigned to a browser navigation sink.",
    "Reject executable URL schemes and allowlist expected http/https destinations.",
  ),
  define(
    "untrusted-url",
    "security.xss.untrusted-url",
    "Untrusted browser URL",
    "xss",
    "high",
    "CWE-20",
    "Browser-controlled data reaches a DOM URL property or attribute.",
    "Validate URL schemes and destinations with a modeled URL validator before assigning the URL.",
  ),
  define(
    "open-redirect",
    "security.xss.open-redirect",
    "Open redirect",
    "xss",
    "high",
    "CWE-601",
    "Browser-controlled data controls a location navigation target.",
    "Resolve redirects through a same-origin or destination allowlist; URL encoding or HTML sanitization is insufficient.",
  ),
  define(
    "post-message-origin",
    "security.browser.post-message-origin",
    "Unsafe postMessage target origin",
    "browser",
    "high",
    "CWE-346",
    "postMessage uses a wildcard or browser-controlled target origin.",
    "Use an explicit trusted target origin derived from configuration, never '*' or message-controlled data.",
  ),
  define(
    "unsafe-window-open",
    "security.browser.unsafe-window-open",
    "Unsafe window.open target",
    "browser",
    "medium",
    "CWE-1022",
    "Browser-controlled data reaches window.open without noopener protection.",
    "Allowlist navigation targets and include the noopener feature when opening a new browsing context.",
  ),
];

export const browserSecurityRules: readonly SecurityRule[] =
  DEFINITIONS.map(createRule);

function define(
  kind: BrowserRuleKind,
  id: string,
  title: string,
  category: SecurityRuleMeta["category"],
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
    kind,
    meta: {
      id,
      title,
      description: message,
      category,
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
      if (definition.kind === "javascript-url") {
        return findJavascriptUrlRisks(context.ast).map((match) =>
          createStructuralFinding(context, definition, match),
        );
      }

      const adapter = createBrowserFlowAdapter(context.ast, definition.kind);
      const flowFindings = analyzeInterproceduralTaint(
        context.ast,
        context.file,
        adapter,
      ).map((match) => createFlowFinding(context, definition, match));

      if (definition.kind !== "post-message-origin") {
        return flowFindings;
      }

      const wildcardFindings = findWildcardPostMessageRisks(context.ast).map(
        (match) => createStructuralFinding(context, definition, match),
      );

      return [...flowFindings, ...wildcardFindings];
    },
  };
}

function createFlowFinding(
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
        message: sourceStep?.label ?? "Browser-controlled source",
        location: sourceStep?.location,
        sourceKind: sourceStep?.sourceKind,
      },
      {
        message: `Browser security sink: ${match.sink.label}`,
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

function createStructuralFinding(
  context: SecurityRuleContext,
  definition: RuleDefinition,
  match: BrowserStructuralMatch,
): SecurityFinding {
  const location = getLocation(match.node, context.file);

  return {
    id: createSecurityFindingId({
      ruleId: definition.meta.id,
      path: context.file,
      range: location.range,
      sinkKind: match.sinkKind,
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
        message: match.label,
        location,
        sinkKind: match.sinkKind,
      },
    ],
    standards: definition.meta.standards,
    sinkKind: match.sinkKind,
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
