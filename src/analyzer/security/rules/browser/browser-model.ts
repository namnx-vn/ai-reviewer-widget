import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type {
  TaintFlowAdapter,
  TaintKind,
  TaintSanitizer,
  TaintSink,
  TaintSource,
} from "../../flow";
import type { SecuritySinkKind } from "../../model/types";

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

type BrowserGlobal =
  | "window"
  | "document"
  | "location"
  | "localStorage"
  | "sessionStorage";

interface ImportedCallable {
  readonly module: string;
  readonly imported: string;
}

interface BrowserModelState {
  readonly shadowedGlobals: ReadonlySet<string>;
  readonly globalAliases: ReadonlyMap<string, BrowserGlobal>;
  readonly namespaces: ReadonlyMap<string, string>;
  readonly callables: ReadonlyMap<string, ImportedCallable>;
  readonly messageBindings: ReadonlySet<string>;
}

const BROWSER_TAINT_KINDS: readonly TaintKind[] = [
  "html",
  "url",
  "navigation",
  "window-open",
  "origin",
];
const TRACKED_GLOBALS = new Set([
  "window",
  "document",
  "location",
  "localStorage",
  "sessionStorage",
  "parent",
  "top",
  "opener",
  "open",
  "postMessage",
  "DOMPurify",
]);
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

function buildModelState(ast: TSESTree.Program): BrowserModelState {
  const declarations = new Map<string, number>();
  const namespaces = new Map<string, string>();
  const callables = new Map<string, ImportedCallable>();

  visit(ast, (node) => {
    collectDeclarations(node, declarations);

    if (node.type !== "ImportDeclaration") {
      return;
    }

    const module = stringLiteralValue(node.source);
    if (module === undefined) {
      return;
    }

    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier") {
        namespaces.set(specifier.local.name, module);
        continue;
      }

      if (specifier.type === "ImportDefaultSpecifier") {
        namespaces.set(specifier.local.name, module);
        callables.set(specifier.local.name, { module, imported: "default" });
        continue;
      }

      const imported = nodeName(specifier.imported);
      if (imported !== undefined) {
        callables.set(specifier.local.name, { module, imported });
      }
    }
  });

  const shadowedGlobals = new Set(
    [...declarations.keys()].filter((name) => TRACKED_GLOBALS.has(name)),
  );
  const globalAliases = new Map<string, BrowserGlobal>();
  const messageBindings = new Set<string>();
  const provisional: BrowserModelState = {
    shadowedGlobals,
    globalAliases,
    namespaces,
    callables,
    messageBindings,
  };

  visit(ast, (node) => {
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init !== null &&
      (declarations.get(node.id.name) ?? 0) === 1
    ) {
      const global = resolveGlobal(node.init, provisional);
      if (global !== undefined) {
        globalAliases.set(node.id.name, global);
      }
    }

    collectMessageBinding(node, provisional, messageBindings);
  });

  return provisional;
}

function collectMessageBinding(
  node: TSESTree.Node,
  state: BrowserModelState,
  output: Set<string>,
): void {
  if (node.type === "CallExpression") {
    const eventType = argumentAt(node, 0);
    const callback = argumentAt(node, 1);
    if (
      staticString(eventType ?? node) === "message" &&
      callback !== undefined &&
      isFunction(callback) &&
      isMessageListenerCallee(node.callee, state)
    ) {
      const first = callback.params[0];
      if (first?.type === "Identifier") {
        output.add(first.name);
      }
    }
  }

  if (
    node.type === "AssignmentExpression" &&
    node.left.type === "MemberExpression" &&
    propertyName(node.left.property, node.left.computed) === "onmessage" &&
    isWindowLike(node.left.object, state) &&
    isFunction(node.right)
  ) {
    const first = node.right.params[0];
    if (first?.type === "Identifier") {
      output.add(first.name);
    }
  }
}

function isMessageListenerCallee(
  node: TSESTree.Node,
  state: BrowserModelState,
): boolean {
  if (node.type === "Identifier") {
    return (
      node.name === "addEventListener" && !state.shadowedGlobals.has(node.name)
    );
  }

  return (
    node.type === "MemberExpression" &&
    propertyName(node.property, node.computed) === "addEventListener" &&
    isWindowLike(node.object, state)
  );
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

function isWindowLike(node: TSESTree.Node, state: BrowserModelState): boolean {
  const expression = unwrapChain(node);
  if (resolveGlobal(expression, state) === "window") {
    return true;
  }

  return (
    expression.type === "Identifier" &&
    new Set(["parent", "top", "opener"]).has(expression.name) &&
    !state.shadowedGlobals.has(expression.name)
  );
}

function resolveGlobal(
  node: TSESTree.Node,
  state: BrowserModelState,
): BrowserGlobal | undefined {
  const expression = unwrapChain(node);

  if (expression.type === "Identifier") {
    const alias = state.globalAliases.get(expression.name);
    if (alias !== undefined) {
      return alias;
    }

    if (state.shadowedGlobals.has(expression.name)) {
      return undefined;
    }

    if (
      expression.name === "window" ||
      expression.name === "document" ||
      expression.name === "location" ||
      expression.name === "localStorage" ||
      expression.name === "sessionStorage"
    ) {
      return expression.name;
    }

    if (
      expression.name === "parent" ||
      expression.name === "top" ||
      expression.name === "opener"
    ) {
      return "window";
    }

    return undefined;
  }

  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const owner = resolveGlobal(expression.object, state);
  const property = propertyName(expression.property, expression.computed);
  if (owner !== "window" || property === undefined) {
    return undefined;
  }

  if (
    property === "document" ||
    property === "location" ||
    property === "localStorage" ||
    property === "sessionStorage"
  ) {
    return property;
  }

  return undefined;
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

function callableIdentity(
  node: TSESTree.Node,
  state: BrowserModelState,
): ImportedCallable | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Identifier") {
    return state.callables.get(expression.name);
  }

  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const path = memberPath(expression);
  if (path === undefined || path.length < 2) {
    return undefined;
  }

  const root = path[0];
  const imported = path[path.length - 1];
  if (root === undefined || imported === undefined) {
    return undefined;
  }

  const module = state.namespaces.get(root);
  return module === undefined ? undefined : { module, imported };
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

function argumentAt(
  node: TSESTree.CallExpression,
  index: number,
): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : argument;
}

function normalizeAttributeName(value: string): string {
  return value === "formaction" ? "formAction" : value.toLowerCase();
}

function isJavascriptUrl(node: TSESTree.Node): boolean {
  const value = staticString(node);
  return (
    value !== undefined &&
    value.trimStart().toLowerCase().startsWith("javascript:")
  );
}

function staticString(node: TSESTree.Node): string | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Literal") {
    return typeof expression.value === "string" ? expression.value : undefined;
  }

  if (
    expression.type === "TemplateLiteral" &&
    expression.expressions.length === 0
  ) {
    return expression.quasis
      .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
      .join("");
  }

  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    const left = staticString(expression.left);
    const right = staticString(expression.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }

  return undefined;
}

function collectDeclarations(
  node: TSESTree.Node,
  declarations: Map<string, number>,
): void {
  if (node.type === "VariableDeclarator") {
    collectPatternNames(node.id, declarations);
  }
  if (node.type === "FunctionDeclaration" && node.id !== null) {
    addDeclaration(node.id.name, declarations);
  }
  if (node.type === "ClassDeclaration" && node.id !== null) {
    addDeclaration(node.id.name, declarations);
  }
  if (node.type === "ImportDeclaration") {
    for (const specifier of node.specifiers) {
      addDeclaration(specifier.local.name, declarations);
    }
  }
  if (node.type === "CatchClause" && node.param !== null) {
    collectPatternNames(node.param, declarations);
  }
  if (isFunction(node)) {
    for (const parameter of node.params) {
      collectPatternNames(parameter, declarations);
    }
  }
}

function collectPatternNames(
  pattern: TSESTree.Node,
  declarations: Map<string, number>,
): void {
  switch (pattern.type) {
    case "Identifier":
      addDeclaration(pattern.name, declarations);
      return;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, declarations);
      return;
    case "RestElement":
      collectPatternNames(pattern.argument, declarations);
      return;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element !== null) {
          collectPatternNames(element, declarations);
        }
      }
      return;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          collectPatternNames(property.argument, declarations);
        } else {
          collectPatternNames(property.value, declarations);
        }
      }
      return;
  }
}

function addDeclaration(name: string, declarations: Map<string, number>): void {
  declarations.set(name, (declarations.get(name) ?? 0) + 1);
}

function memberPath(node: TSESTree.Node): readonly string[] | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Identifier") {
    return [expression.name];
  }
  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const object = memberPath(expression.object);
  const property = propertyName(expression.property, expression.computed);
  return object === undefined || property === undefined
    ? undefined
    : [...object, property];
}

function propertyName(
  node: TSESTree.Node,
  computed: boolean,
): string | undefined {
  if (!computed && node.type === "Identifier") {
    return node.name;
  }
  return stringLiteralValue(node);
}

function nodeName(node: TSESTree.Node): string | undefined {
  return node.type === "Identifier" ? node.name : stringLiteralValue(node);
}

function stringLiteralValue(node: TSESTree.Node): string | undefined {
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}

function unwrapChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === "ChainExpression" ? node.expression : node;
}

function isFunction(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration {
  return (
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration"
  );
}

function visit(
  node: TSESTree.Node,
  visitor: (node: TSESTree.Node) => void,
): void {
  visitor(node);

  const children: TSESTree.Node[] = [];
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    }
  }

  children.sort(
    (left, right) =>
      (left.range?.[0] ?? Number.MAX_SAFE_INTEGER) -
      (right.range?.[0] ?? Number.MAX_SAFE_INTEGER),
  );

  for (const child of children) {
    visit(child, visitor);
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
