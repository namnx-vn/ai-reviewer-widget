import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type {
  TaintFlowAdapter,
  TaintKind,
  TaintSanitizer,
  TaintSink,
  TaintSource,
} from "../../flow";
import type { SecuritySinkKind } from "../../model/types";

import {
  argumentAt,
  isJavascriptUrl,
  memberPath,
  normalizeAttributeName,
  propertyName,
  staticString,
  visit,
} from "./browser-syntax";
import {
  buildModelState,
  callableIdentity,
  isWindowLike,
  resolveGlobal,
  type BrowserModelState,
  type ImportedCallable,
} from "./browser-state";

export type BrowserFlowTarget =
  | "inner-html"
  | "outer-html"
  | "document-write"
  | "insert-adjacent-html"
  | "untrusted-url"
  | "open-redirect"
  | "post-message-origin"
  | "unsafe-window-open";

export interface BrowserStructuralMatch {
  readonly node: TSESTree.Node;
  readonly label: string;
  readonly sinkKind: SecuritySinkKind;
}

const BROWSER_TAINT_KINDS: readonly TaintKind[] = [
  "html",
  "url",
  "navigation",
  "window-open",
  "origin",
];
const URL_PROPERTIES = new Set(["href", "src", "action", "formAction"]);
const HTML_MODULES = new Set(["dompurify", "sanitize-html", "xss"]);
const URL_SANITIZER_MODULE = "@braintree/sanitize-url";

export function createBrowserFlowAdapter(
  ast: TSESTree.Program,
  target: BrowserFlowTarget,
): TaintFlowAdapter {
  const state = buildModelState(ast);

  return {
    matchSource: (node) => matchSource(node, state),
    matchSanitizer: (node) => matchSanitizer(node, state),
    matchSinks: (node) => matchTargetSink(node, target, state),
  };
}

export function findJavascriptUrlRisks(
  ast: TSESTree.Program,
): readonly BrowserStructuralMatch[] {
  const state = buildModelState(ast);
  const matches: BrowserStructuralMatch[] = [];

  visit(ast, (node) => {
    const sink = javascriptUrlSink(node, state);
    if (sink !== undefined && isJavascriptUrl(sink.value)) {
      matches.push({
        node: sink.node,
        label: sink.label,
        sinkKind: sink.sinkKind,
      });
    }
  });

  return matches;
}

export function findWildcardPostMessageRisks(
  ast: TSESTree.Program,
): readonly BrowserStructuralMatch[] {
  const state = buildModelState(ast);
  const matches: BrowserStructuralMatch[] = [];

  visit(ast, (node) => {
    if (node.type !== "CallExpression" || !isPostMessageCall(node, state)) {
      return;
    }

    const targetOrigin = postMessageTargetOrigin(node);
    if (targetOrigin === undefined || staticString(targetOrigin) !== "*") {
      return;
    }

    matches.push({
      node,
      label: "window.postMessage wildcard target origin",
      sinkKind: "post-message",
    });
  });

  return matches;
}

function matchSource(
  node: TSESTree.Node,
  state: BrowserModelState,
): TaintSource | undefined {
  if (node.type === "MemberExpression") {
    const property = propertyName(node.property, node.computed);
    const owner = resolveGlobal(node.object, state);

    if (
      owner === "location" &&
      property !== undefined &&
      new Set(["href", "search", "hash", "pathname"]).has(property)
    ) {
      return source(
        node,
        `Browser location input: location.${property}`,
        "browser-location",
      );
    }

    if (
      owner === "document" &&
      property !== undefined &&
      new Set(["URL", "documentURI", "referrer"]).has(property)
    ) {
      return source(
        node,
        `Document URL input: document.${property}`,
        "browser-location",
      );
    }

    if (owner === "document" && property === "cookie") {
      return source(node, "Browser cookie storage input", "storage");
    }

    if (owner === "window" && property === "name") {
      return source(node, "Cross-navigation window.name input", "user-input");
    }

    if (
      property === "data" &&
      node.object.type === "Identifier" &&
      state.messageBindings.has(node.object.name)
    ) {
      return source(
        node,
        `Message event data: ${node.object.name}.data`,
        "message-data",
      );
    }
  }

  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression"
  ) {
    return undefined;
  }

  const owner = resolveGlobal(node.callee.object, state);
  const method = propertyName(node.callee.property, node.callee.computed);
  if (
    (owner === "localStorage" || owner === "sessionStorage") &&
    method === "getItem"
  ) {
    return source(node, `${owner}.getItem() storage input`, "storage");
  }

  return undefined;
}

function source(
  node: TSESTree.Node,
  label: string,
  sourceKind: TaintSource["sourceKind"],
): TaintSource {
  return {
    node,
    label,
    sourceKind,
    kinds: BROWSER_TAINT_KINDS,
  };
}

function matchSanitizer(
  node: TSESTree.CallExpression,
  state: BrowserModelState,
): TaintSanitizer | undefined {
  const identity = callableIdentity(node.callee, state);
  const path = memberPath(node.callee);

  if (
    isDomPurifySanitizer(identity, path, state) ||
    isHtmlSanitizerIdentity(identity)
  ) {
    return {
      node,
      label: "HTML sanitizer",
      sanitizerKind: "html-escape",
      clears: ["html"],
      argumentIndex: 0,
    };
  }

  if (
    identity !== undefined &&
    identity.module === URL_SANITIZER_MODULE &&
    identity.imported === "sanitizeUrl"
  ) {
    return {
      node,
      label: "URL scheme sanitizer",
      sanitizerKind: "url-allowlist",
      clears: ["url"],
      argumentIndex: 0,
    };
  }

  return undefined;
}

function matchTargetSink(
  node: TSESTree.Node,
  target: BrowserFlowTarget,
  state: BrowserModelState,
): readonly TaintSink[] {
  switch (target) {
    case "inner-html":
      return assignmentPropertySink(
        node,
        "innerHTML",
        "html",
        "DOM innerHTML assignment",
      );
    case "outer-html":
      return assignmentPropertySink(
        node,
        "outerHTML",
        "html",
        "DOM outerHTML assignment",
      );
    case "document-write":
      return documentWriteSink(node, state);
    case "insert-adjacent-html":
      return insertAdjacentHtmlSink(node);
    case "untrusted-url":
      return untrustedUrlSink(node, state);
    case "open-redirect":
      return openRedirectSink(node, state);
    case "post-message-origin":
      return postMessageOriginSink(node, state);
    case "unsafe-window-open":
      return windowOpenSink(node, state);
  }
}

function assignmentPropertySink(
  node: TSESTree.Node,
  property: string,
  family: TaintKind,
  label: string,
): readonly TaintSink[] {
  if (
    node.type !== "AssignmentExpression" ||
    node.left.type !== "MemberExpression" ||
    propertyName(node.left.property, node.left.computed) !== property
  ) {
    return [];
  }

  return [
    {
      family,
      node,
      value: node.right,
      label,
      sinkKind: "dom-html",
    },
  ];
}

function documentWriteSink(
  node: TSESTree.Node,
  state: BrowserModelState,
): readonly TaintSink[] {
  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression" ||
    resolveGlobal(node.callee.object, state) !== "document"
  ) {
    return [];
  }

  const method = propertyName(node.callee.property, node.callee.computed);
  if (method !== "write" && method !== "writeln") {
    return [];
  }

  return argumentSink(node, 0, "html", "document.write HTML sink", "dom-html");
}

function insertAdjacentHtmlSink(node: TSESTree.Node): readonly TaintSink[] {
  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression" ||
    propertyName(node.callee.property, node.callee.computed) !==
      "insertAdjacentHTML"
  ) {
    return [];
  }

  return argumentSink(
    node,
    1,
    "html",
    "insertAdjacentHTML HTML sink",
    "dom-html",
  );
}

function untrustedUrlSink(
  node: TSESTree.Node,
  state: BrowserModelState,
): readonly TaintSink[] {
  if (
    node.type === "AssignmentExpression" &&
    node.left.type === "MemberExpression"
  ) {
    const property = propertyName(node.left.property, node.left.computed);
    if (
      property !== undefined &&
      URL_PROPERTIES.has(property) &&
      resolveGlobal(node.left.object, state) !== "location"
    ) {
      return [
        {
          family: "url",
          node,
          value: node.right,
          label: `DOM URL property assignment: ${property}`,
          sinkKind: "browser-navigation",
        },
      ];
    }
  }

  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression" ||
    propertyName(node.callee.property, node.callee.computed) !== "setAttribute"
  ) {
    return [];
  }

  const attribute = argumentAt(node, 0);
  const value = argumentAt(node, 1);
  const attributeName =
    attribute === undefined ? undefined : staticString(attribute);
  if (
    value === undefined ||
    attributeName === undefined ||
    !URL_PROPERTIES.has(normalizeAttributeName(attributeName))
  ) {
    return [];
  }

  return [
    {
      family: "url",
      node,
      value,
      label: `DOM URL attribute assignment: ${attributeName}`,
      sinkKind: "browser-navigation",
    },
  ];
}

function openRedirectSink(
  node: TSESTree.Node,
  state: BrowserModelState,
): readonly TaintSink[] {
  if (node.type === "AssignmentExpression") {
    if (isLocationAssignmentTarget(node.left, state)) {
      return [
        {
          family: "navigation",
          node,
          value: node.right,
          label: "Browser location navigation",
          sinkKind: "browser-navigation",
        },
      ];
    }
    return [];
  }

  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression" ||
    resolveGlobal(node.callee.object, state) !== "location"
  ) {
    return [];
  }

  const method = propertyName(node.callee.property, node.callee.computed);
  if (method !== "assign" && method !== "replace") {
    return [];
  }

  return argumentSink(
    node,
    0,
    "navigation",
    `location.${method} navigation`,
    "browser-navigation",
  );
}

function postMessageOriginSink(
  node: TSESTree.Node,
  state: BrowserModelState,
): readonly TaintSink[] {
  if (node.type !== "CallExpression" || !isPostMessageCall(node, state)) {
    return [];
  }

  const targetOrigin = postMessageTargetOrigin(node);
  if (targetOrigin === undefined || staticString(targetOrigin) !== undefined) {
    return [];
  }

  return [
    {
      family: "origin",
      node,
      value: targetOrigin,
      label: "Dynamic postMessage target origin",
      sinkKind: "post-message",
    },
  ];
}

function windowOpenSink(
  node: TSESTree.Node,
  state: BrowserModelState,
): readonly TaintSink[] {
  if (
    node.type !== "CallExpression" ||
    !isWindowOpenCall(node, state) ||
    hasNoopener(node) ||
    targetsCurrentContext(node)
  ) {
    return [];
  }

  return argumentSink(
    node,
    0,
    "window-open",
    "window.open without noopener",
    "window-open",
  );
}

function javascriptUrlSink(
  node: TSESTree.Node,
  state: BrowserModelState,
): (BrowserStructuralMatch & { readonly value: TSESTree.Node }) | undefined {
  if (node.type === "AssignmentExpression") {
    if (isLocationAssignmentTarget(node.left, state)) {
      return {
        node,
        value: node.right,
        label: "javascript: browser navigation",
        sinkKind: "browser-navigation",
      };
    }

    if (node.left.type === "MemberExpression") {
      const property = propertyName(node.left.property, node.left.computed);
      if (property !== undefined && URL_PROPERTIES.has(property)) {
        return {
          node,
          value: node.right,
          label: `javascript: URL assigned to ${property}`,
          sinkKind: "browser-navigation",
        };
      }
    }
  }

  if (node.type !== "CallExpression") {
    return undefined;
  }

  if (isWindowOpenCall(node, state)) {
    const value = argumentAt(node, 0);
    return value === undefined
      ? undefined
      : {
          node,
          value,
          label: "javascript: URL passed to window.open",
          sinkKind: "window-open",
        };
  }

  if (
    node.callee.type === "MemberExpression" &&
    resolveGlobal(node.callee.object, state) === "location"
  ) {
    const method = propertyName(node.callee.property, node.callee.computed);
    if (method === "assign" || method === "replace") {
      const value = argumentAt(node, 0);
      return value === undefined
        ? undefined
        : {
            node,
            value,
            label: `javascript: URL passed to location.${method}`,
            sinkKind: "browser-navigation",
          };
    }
  }

  if (
    node.callee.type === "MemberExpression" &&
    propertyName(node.callee.property, node.callee.computed) === "setAttribute"
  ) {
    const attribute = argumentAt(node, 0);
    const value = argumentAt(node, 1);
    const name = attribute === undefined ? undefined : staticString(attribute);
    if (
      value !== undefined &&
      name !== undefined &&
      URL_PROPERTIES.has(normalizeAttributeName(name))
    ) {
      return {
        node,
        value,
        label: `javascript: URL assigned through ${name}`,
        sinkKind: "browser-navigation",
      };
    }
  }

  return undefined;
}

function isPostMessageCall(
  node: TSESTree.CallExpression,
  state: BrowserModelState,
): boolean {
  if (node.callee.type === "Identifier") {
    return (
      node.callee.name === "postMessage" &&
      !state.shadowedGlobals.has("postMessage")
    );
  }

  return (
    node.callee.type === "MemberExpression" &&
    propertyName(node.callee.property, node.callee.computed) ===
      "postMessage" &&
    isWindowLike(node.callee.object, state)
  );
}

function postMessageTargetOrigin(
  node: TSESTree.CallExpression,
): TSESTree.Node | undefined {
  const second = argumentAt(node, 1);
  if (second === undefined) {
    return undefined;
  }

  if (second.type !== "ObjectExpression") {
    return second;
  }

  for (const property of second.properties) {
    if (
      property.type !== "SpreadElement" &&
      propertyName(property.key, property.computed) === "targetOrigin"
    ) {
      return property.value;
    }
  }

  return undefined;
}

function isWindowOpenCall(
  node: TSESTree.CallExpression,
  state: BrowserModelState,
): boolean {
  if (node.callee.type === "Identifier") {
    return node.callee.name === "open" && !state.shadowedGlobals.has("open");
  }

  return (
    node.callee.type === "MemberExpression" &&
    propertyName(node.callee.property, node.callee.computed) === "open" &&
    isWindowLike(node.callee.object, state)
  );
}

function hasNoopener(node: TSESTree.CallExpression): boolean {
  const features = argumentAt(node, 2);
  const value = features === undefined ? undefined : staticString(features);
  if (value === undefined) {
    return false;
  }

  return value
    .split(",")
    .some((feature) => feature.trim().toLowerCase() === "noopener");
}

function targetsCurrentContext(node: TSESTree.CallExpression): boolean {
  const target = argumentAt(node, 1);
  const value =
    target === undefined ? undefined : staticString(target)?.toLowerCase();
  return value === "_self" || value === "_top" || value === "_parent";
}

function isLocationAssignmentTarget(
  node: TSESTree.Node,
  state: BrowserModelState,
): boolean {
  if (node.type === "Identifier") {
    return resolveGlobal(node, state) === "location";
  }

  if (node.type !== "MemberExpression") {
    return false;
  }

  const property = propertyName(node.property, node.computed);
  if (resolveGlobal(node, state) === "location") {
    return true;
  }

  return (
    resolveGlobal(node.object, state) === "location" &&
    (property === "href" ||
      property === "pathname" ||
      property === "search" ||
      property === "hash")
  );
}

function isDomPurifySanitizer(
  identity: ImportedCallable | undefined,
  path: readonly string[] | undefined,
  state: BrowserModelState,
): boolean {
  if (
    identity !== undefined &&
    identity.module === "dompurify" &&
    identity.imported === "sanitize"
  ) {
    return true;
  }

  if (path === undefined || path[path.length - 1] !== "sanitize") {
    return false;
  }

  const root = path[0];
  if (root === undefined) {
    return false;
  }

  if (root === "DOMPurify" && !state.shadowedGlobals.has("DOMPurify")) {
    return true;
  }

  return state.namespaces.get(root) === "dompurify";
}

function isHtmlSanitizerIdentity(
  identity: ImportedCallable | undefined,
): boolean {
  if (identity === undefined || !HTML_MODULES.has(identity.module)) {
    return false;
  }

  if (identity.module === "sanitize-html") {
    return (
      identity.imported === "default" || identity.imported === "sanitizeHtml"
    );
  }

  if (identity.module === "xss") {
    return identity.imported === "default" || identity.imported === "xss";
  }

  return false;
}

function argumentSink(
  node: TSESTree.CallExpression,
  index: number,
  family: TaintKind,
  label: string,
  sinkKind: SecuritySinkKind,
): readonly TaintSink[] {
  const value = argumentAt(node, index);
  return value === undefined ? [] : [{ family, node, value, label, sinkKind }];
}
