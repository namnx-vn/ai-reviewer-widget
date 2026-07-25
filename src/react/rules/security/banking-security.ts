import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../../../analyzer/security/engine/finding-id";
import {
  classifySensitiveDataName,
  classifySensitiveDataNode,
} from "../../../analyzer/security/rules/data";
import type { ReviewFinding, Severity } from "../../../review/types";
import {
  getJSXAttribute,
  getJSXElementName,
  getJSXExpression,
} from "../../ast/jsx-utils";
import type { ReactRule, ReactRuleContext } from "../../engine/react-rule";

type BankingKind =
  | "dangerously-set-inner-html"
  | "untrusted-href"
  | "untrusted-src"
  | "external-form-action"
  | "sensitive-local-storage"
  | "sensitive-session-storage"
  | "sensitive-query-param"
  | "third-party-script"
  | "unsafe-iframe"
  | "unsafe-post-message"
  | "missing-opener-protection"
  | "sensitive-autocomplete";

interface Definition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly confidence: number;
  readonly suggestion: string;
}

interface Match {
  readonly node: TSESTree.Node;
  readonly message: string;
}

const DEFINITIONS: Readonly<Record<BankingKind, Definition>> = {
  "dangerously-set-inner-html": define("security.react.dangerously-set-inner-html", "Unsafe React HTML injection", "Unsanitized dangerouslySetInnerHTML is used in a React rendering boundary.", "high", 0.98, "Sanitize trusted HTML with an approved sanitizer or render structured React nodes instead."),
  "untrusted-href": define("security.react.untrusted-href", "Untrusted React navigation target", "A browser-controlled value reaches an href navigation boundary.", "high", 0.96, "Allowlist destinations and protocols before assigning navigation targets."),
  "untrusted-src": define("security.react.untrusted-src", "Untrusted React resource source", "A browser-controlled value reaches a src resource boundary.", "high", 0.96, "Allowlist resource origins and protocols before assigning src."),
  "external-form-action": define("security.react.external-form-action", "External form action", "A form submits banking data to an external or browser-controlled action.", "high", 0.98, "Submit sensitive forms only to an approved same-origin server endpoint."),
  "sensitive-local-storage": define("security.react.sensitive-local-storage", "Sensitive data in localStorage", "Sensitive banking/authentication data is written to persistent browser storage.", "high", 0.99, "Keep sensitive values out of localStorage and use protected server-managed session state."),
  "sensitive-session-storage": define("security.react.sensitive-session-storage", "Sensitive data in sessionStorage", "Sensitive banking/authentication data is written to browser session storage.", "high", 0.99, "Avoid storing credentials, payment data, or PII in sessionStorage."),
  "sensitive-query-param": define("security.react.sensitive-query-param", "Sensitive data in query parameters", "Sensitive data is added to a browser query parameter.", "high", 0.98, "Keep sensitive values out of URLs; use protected request bodies or server-side state."),
  "third-party-script": define("security.react.third-party-script", "Third-party script in banking UI", "An external script is loaded into the React application.", "medium", 0.99, "Self-host approved scripts or enforce a reviewed origin, integrity metadata, and CSP."),
  "unsafe-iframe": define("security.react.unsafe-iframe", "Unsafe external iframe", "An external or dynamic iframe is rendered without a sandbox boundary.", "high", 0.98, "Use a restrictive sandbox and an allowlisted iframe origin."),
  "unsafe-post-message": define("security.react.unsafe-post-message", "Unsafe postMessage target", "postMessage sends data to a wildcard or unspecified target origin.", "high", 0.99, "Use an exact allowlisted target origin and validate received message origins."),
  "missing-opener-protection": define("security.react.missing-opener-protection", "Missing opener protection", "A new-tab external link does not include noopener or noreferrer protection.", "medium", 0.99, "Add rel=\"noopener noreferrer\" to external target=_blank links."),
  "sensitive-autocomplete": define("security.react.sensitive-autocomplete", "Unsafe autocomplete for sensitive field", "A highly sensitive banking input allows an unsafe autocomplete mode.", "medium", 0.96, "Use one-time-code for OTP fields and disable autocomplete for PIN/CVV-style secrets where appropriate."),
};

export const reactBankingSecurityRules: readonly ReactRule[] = (
  Object.keys(DEFINITIONS) as BankingKind[]
).map((kind) => ({
  id: DEFINITIONS[kind].id,
  description: DEFINITIONS[kind].description,
  check(node, context): ReviewFinding[] {
    const match = detect(kind, node, context);
    return match === undefined ? [] : [createFinding(kind, match, context.file)];
  },
}));

function define(
  id: string,
  title: string,
  description: string,
  severity: Severity,
  confidence: number,
  suggestion: string,
): Definition {
  return { id, title, description, severity, confidence, suggestion };
}

function detect(kind: BankingKind, node: TSESTree.Node, context: ReactRuleContext): Match | undefined {
  if (kind === "sensitive-local-storage") return storageMatch(node, context, "localStorage");
  if (kind === "sensitive-session-storage") return storageMatch(node, context, "sessionStorage");
  if (kind === "sensitive-query-param") return sensitiveQueryMatch(node, context);
  if (kind === "unsafe-post-message") return postMessageMatch(node);
  if (node.type !== "JSXOpeningElement") return undefined;

  const element = getJSXElementName(node);
  if (element === undefined || element.kind !== "intrinsic") return undefined;

  if (kind === "dangerously-set-inner-html") return dangerousHtmlMatch(node, context);
  if (kind === "untrusted-href") return urlAttributeMatch(node, context, "href", new Set(["a", "area"]));
  if (kind === "untrusted-src") return urlAttributeMatch(node, context, "src", new Set(["img", "script", "iframe", "source", "video", "audio"]));
  if (kind === "external-form-action" && element.name === "form") return externalFormMatch(node, context);
  if (kind === "third-party-script" && element.name === "script") return thirdPartyScriptMatch(node);
  if (kind === "unsafe-iframe" && element.name === "iframe") return iframeMatch(node, context);
  if (kind === "missing-opener-protection" && element.name === "a") return openerMatch(node, context);
  if (kind === "sensitive-autocomplete" && element.name === "input") return autocompleteMatch(node);
  return undefined;
}

function dangerousHtmlMatch(node: TSESTree.JSXOpeningElement, context: ReactRuleContext): Match | undefined {
  const attribute = getJSXAttribute(node, "dangerouslySetInnerHTML");
  if (attribute === undefined) return undefined;
  const expression = getJSXExpression(attribute);
  if (expression !== undefined && expression !== null && containsHtmlSanitizer(resolveExpression(expression, context.ast), context.ast)) return undefined;
  return { node: attribute, message: "dangerouslySetInnerHTML is used without a visible approved HTML sanitizer." };
}

function urlAttributeMatch(
  node: TSESTree.JSXOpeningElement,
  context: ReactRuleContext,
  attributeName: "href" | "src",
  elements: ReadonlySet<string>,
): Match | undefined {
  const element = getJSXElementName(node);
  if (element === undefined || !elements.has(element.name)) return undefined;
  const attribute = getJSXAttribute(node, attributeName);
  if (attribute === undefined) return undefined;
  const literal = jsxString(attribute);
  if (literal !== undefined) {
    if (/^javascript:/i.test(literal)) return { node: attribute, message: `${attributeName} uses the javascript protocol.` };
    return undefined;
  }
  const expression = getJSXExpression(attribute);
  if (expression === undefined || expression === null) return undefined;
  return containsUntrustedBrowserSource(resolveExpression(expression, context.ast), context.ast)
    ? { node: attribute, message: `Browser-controlled data reaches ${attributeName}.` }
    : undefined;
}

function externalFormMatch(node: TSESTree.JSXOpeningElement, context: ReactRuleContext): Match | undefined {
  const action = getJSXAttribute(node, "action");
  if (action === undefined) return undefined;
  const literal = jsxString(action);
  if (literal !== undefined) return isExternalUrl(literal) ? { node: action, message: "Form action targets an external origin." } : undefined;
  const expression = getJSXExpression(action);
  if (expression === undefined || expression === null) return undefined;
  return containsUntrustedBrowserSource(resolveExpression(expression, context.ast), context.ast)
    ? { node: action, message: "Form action is controlled by browser-derived data." }
    : undefined;
}

function storageMatch(node: TSESTree.Node, context: ReactRuleContext, storage: "localStorage" | "sessionStorage"): Match | undefined {
  if (node.type !== "CallExpression" || calleeName(node.callee) !== `${storage}.setItem`) return undefined;
  const key = expressionArgument(node, 0);
  const value = expressionArgument(node, 1);
  if (key === undefined || value === undefined) return undefined;
  const keyName = staticString(key);
  const sensitiveKey = keyName !== undefined && classifySensitiveDataName(keyName).length > 0;
  const sensitiveValue = containsSensitiveData(resolveExpression(value, context.ast), context.ast);
  return sensitiveKey || sensitiveValue
    ? { node, message: `Classified sensitive data is written to ${storage}.` }
    : undefined;
}

function sensitiveQueryMatch(node: TSESTree.Node, context: ReactRuleContext): Match | undefined {
  if (node.type !== "CallExpression") return undefined;
  const name = calleeName(node.callee);
  if (!/(?:URLSearchParams|searchParams|params)\.(?:set|append)$/.test(name)) return undefined;
  const key = expressionArgument(node, 0);
  const value = expressionArgument(node, 1);
  if (key === undefined || value === undefined) return undefined;
  const keyName = staticString(key);
  const sensitiveKey = keyName !== undefined && classifySensitiveDataName(keyName).length > 0;
  const sensitiveValue = containsSensitiveData(resolveExpression(value, context.ast), context.ast);
  return sensitiveKey || sensitiveValue
    ? { node, message: "Classified sensitive data is added to a URL query parameter." }
    : undefined;
}

function thirdPartyScriptMatch(node: TSESTree.JSXOpeningElement): Match | undefined {
  const src = getJSXAttribute(node, "src");
  const value = src === undefined ? undefined : jsxString(src);
  return src !== undefined && value !== undefined && isExternalUrl(value)
    ? { node: src, message: "An external script origin is loaded into the application." }
    : undefined;
}

function iframeMatch(node: TSESTree.JSXOpeningElement, context: ReactRuleContext): Match | undefined {
  if (getJSXAttribute(node, "sandbox") !== undefined) return undefined;
  const src = getJSXAttribute(node, "src");
  if (src === undefined) return undefined;
  const literal = jsxString(src);
  if (literal !== undefined) return isExternalUrl(literal) ? { node: src, message: "External iframe is rendered without sandbox." } : undefined;
  const expression = getJSXExpression(src);
  if (expression === undefined || expression === null) return undefined;
  return containsUntrustedBrowserSource(resolveExpression(expression, context.ast), context.ast)
    ? { node: src, message: "Dynamic iframe source is rendered without sandbox." }
    : undefined;
}

function postMessageMatch(node: TSESTree.Node): Match | undefined {
  if (node.type !== "CallExpression") return undefined;
  const name = calleeName(node.callee);
  if (!/^(?:window|parent|top|opener)\.postMessage$/.test(name)) return undefined;
  const targetOrigin = expressionArgument(node, 1);
  const target = targetOrigin === undefined ? undefined : staticString(targetOrigin);
  return targetOrigin === undefined || target === "*"
    ? { node, message: "postMessage uses a wildcard or unspecified target origin." }
    : undefined;
}

function openerMatch(node: TSESTree.JSXOpeningElement, context: ReactRuleContext): Match | undefined {
  const target = getJSXAttribute(node, "target");
  if (target === undefined || jsxString(target) !== "_blank") return undefined;
  const href = getJSXAttribute(node, "href");
  if (href === undefined) return undefined;
  const literal = jsxString(href);
  const expression = getJSXExpression(href);
  const external = literal !== undefined
    ? isExternalUrl(literal)
    : expression !== undefined && expression !== null && containsUntrustedBrowserSource(resolveExpression(expression, context.ast), context.ast);
  if (!external) return undefined;
  const rel = getJSXAttribute(node, "rel");
  const relValue = rel === undefined ? undefined : jsxString(rel)?.toLowerCase();
  return relValue !== undefined && /(?:^|\s)(?:noopener|noreferrer)(?:\s|$)/.test(relValue)
    ? undefined
    : { node, message: "External target=_blank link lacks noopener/noreferrer." };
}

function autocompleteMatch(node: TSESTree.JSXOpeningElement): Match | undefined {
  const nameAttribute = getJSXAttribute(node, "name") ?? getJSXAttribute(node, "id");
  const field = nameAttribute === undefined ? undefined : jsxString(nameAttribute)?.toLowerCase();
  if (field === undefined || !/(?:otp|pin|cvv|cvc|security.?code)/i.test(field)) return undefined;
  const autocomplete = getJSXAttribute(node, "autoComplete") ?? getJSXAttribute(node, "autocomplete");
  const mode = autocomplete === undefined ? undefined : jsxString(autocomplete)?.toLowerCase();
  if (/otp/.test(field) && mode === "one-time-code") return undefined;
  if (!/otp/.test(field) && mode === "off") return undefined;
  return { node: autocomplete ?? nameAttribute, message: "Sensitive input uses a missing or unsafe autocomplete mode." };
}

function containsHtmlSanitizer(node: TSESTree.Node, ast: TSESTree.Program): boolean {
  let found = false;
  visit(node, (child) => {
    if (child.type !== "CallExpression") return;
    const name = calleeName(child.callee);
    if (/^(?:sanitizeHtml|escapeHtml|DOMPurify\.sanitize)$/.test(name)) found = true;
  });
  if (found || node.type !== "Identifier") return found;
  const resolved = resolveIdentifier(node.name, ast);
  return resolved !== undefined && resolved !== node && containsHtmlSanitizer(resolved, ast);
}

function containsUntrustedBrowserSource(node: TSESTree.Node, ast: TSESTree.Program): boolean {
  let found = false;
  visit(node, (child) => {
    if (child.type === "MemberExpression") {
      const root = memberRoot(child);
      const property = memberPropertyName(child);
      if ((root === "location" || root === "window" || root === "document") && property !== undefined && /^(?:href|search|hash|location|URL|referrer)$/.test(property)) found = true;
    }
    if (child.type === "CallExpression" && /(?:searchParams|params|query)\.get$/.test(calleeName(child.callee))) found = true;
  });
  if (found) return true;
  if (node.type === "Identifier") {
    const resolved = resolveIdentifier(node.name, ast);
    return resolved !== undefined && resolved !== node && containsUntrustedBrowserSource(resolved, ast);
  }
  return false;
}

function containsSensitiveData(node: TSESTree.Node, ast: TSESTree.Program): boolean {
  let found = false;
  visit(node, (child) => {
    if (classifySensitiveDataNode(child).length > 0) found = true;
  });
  if (found) return true;
  if (node.type === "Identifier") {
    const resolved = resolveIdentifier(node.name, ast);
    return resolved !== undefined && resolved !== node && containsSensitiveData(resolved, ast);
  }
  return false;
}

function resolveExpression(expression: TSESTree.Expression, ast: TSESTree.Program): TSESTree.Node {
  if (expression.type !== "Identifier") return expression;
  return resolveIdentifier(expression.name, ast) ?? expression;
}

function resolveIdentifier(name: string, ast: TSESTree.Program): TSESTree.Node | undefined {
  let resolved: TSESTree.Node | undefined;
  visit(ast, (node) => {
    if (resolved !== undefined || node.type !== "VariableDeclarator" || node.id.type !== "Identifier" || node.id.name !== name || node.init === null) return;
    resolved = node.init;
  });
  return resolved;
}

function jsxString(attribute: TSESTree.JSXAttribute): string | undefined {
  if (attribute.value?.type === "Literal" && typeof attribute.value.value === "string") return attribute.value.value;
  const expression = getJSXExpression(attribute);
  return expression === undefined || expression === null ? undefined : staticString(expression);
}

function staticString(node: TSESTree.Node): string | undefined {
  return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function expressionArgument(node: TSESTree.CallExpression, index: number): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement" ? undefined : argument;
}

function isExternalUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value);
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

function calleeName(node: TSESTree.Node): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") {
    const object = calleeName(node.object);
    const property = memberPropertyName(node);
    return object.length === 0 || property === undefined ? "" : `${object}.${property}`;
  }
  return "";
}

function createFinding(kind: BankingKind, match: Match, file: string): ReviewFinding {
  const definition = DEFINITIONS[kind];
  const line = match.node.loc?.start.line ?? 1;
  const column = match.node.loc?.start.column ?? 0;
  const range = match.node.range === undefined ? undefined : { start: match.node.range[0], end: match.node.range[1] };
  return {
    id: createSecurityFindingId({ ruleId: definition.id, path: file, range, sinkKind: "unknown" }),
    ruleId: definition.id,
    title: definition.title,
    message: match.message,
    severity: definition.severity,
    source: "security",
    location: { file, line, column },
    suggestion: definition.suggestion,
    confidence: definition.confidence,
  };
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
