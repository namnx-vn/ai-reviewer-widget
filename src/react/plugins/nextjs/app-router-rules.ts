import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding, Severity } from "../../../domain/review";
import type { ReactRule, ReactRuleContext } from "../../engine/react-rule";
import { getJSXAttributeName } from "../../ast/jsx-utils";

const CLIENT_DIRECTIVE = "use client";
const CLIENT_ONLY_HOOKS = new Set([
  "useCallback",
  "useContext",
  "useDeferredValue",
  "useEffect",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
]);
const SERVER_ONLY_MODULES = new Set(["next/headers", "next/cache", "server-only"]);
const NEXT_NAVIGATION_CLIENT_HOOKS = new Set([
  "useParams",
  "usePathname",
  "useRouter",
  "useSearchParams",
  "useSelectedLayoutSegment",
  "useSelectedLayoutSegments",
]);

export const nextjsClientHookInServerComponentRule: ReactRule = {
  id: "nextjs.app-router.client-hook-in-server-component",
  description: "Detect React client hooks used by App Router Server Components.",

  check(node, context) {
    if (
      node.type !== "CallExpression" ||
      !isAppRouterFile(context.file) ||
      isClientComponent(context)
    ) {
      return [];
    }

    const hook = context.hooks.hooks.find((entry) => entry.hook.node === node);

    const reactClientHook =
      hook !== undefined &&
      hook.hook.isReactImport &&
      CLIENT_ONLY_HOOKS.has(hook.hook.name);
    const navigationClientHook = isNextNavigationClientHook(node, context);

    if (!reactClientHook && !navigationClientHook) {
      return [];
    }

    const hookName = hook?.hook.name ?? getCallName(node) ?? "This hook";

    return [createFinding(context.file, node, {
      ruleId: "nextjs.app-router.client-hook-in-server-component",
      title: "Client hook used in a Server Component",
      message: `${hookName} requires a Client Component, but this App Router module has no valid "use client" directive.`,
      severity: "high",
      suggestion: "Move this interactive code into a child Client Component, or add \"use client\" as the first statement when the module must run in the browser.",
    })];
  },
};

export const nextjsEventHandlerInServerComponentRule: ReactRule = {
  id: "nextjs.app-router.event-handler-in-server-component",
  description: "Detect JSX event handlers in App Router Server Components.",

  check(node, context) {
    if (
      node.type !== "JSXAttribute" ||
      !isAppRouterFile(context.file) ||
      isClientComponent(context)
    ) {
      return [];
    }

    const attributeName = getJSXAttributeName(node);

    if (
      attributeName === undefined ||
      !/^on[A-Z]/.test(attributeName) ||
      node.value === null
    ) {
      return [];
    }

    return [createFinding(context.file, node, {
      ruleId: "nextjs.app-router.event-handler-in-server-component",
      title: "Event handler used in a Server Component",
      message: `${attributeName} cannot be passed from an App Router Server Component to a DOM element.`,
      severity: "high",
      suggestion: "Move the interactive element into a Client Component and pass serializable props from the Server Component.",
    })];
  },
};

export const nextjsServerImportInClientComponentRule: ReactRule = {
  id: "nextjs.app-router.server-import-in-client-component",
  description: "Detect server-only imports in App Router Client Components.",

  check(node, context) {
    if (
      node.type !== "ImportDeclaration" ||
      !isAppRouterFile(context.file) ||
      !isClientComponent(context)
    ) {
      return [];
    }

    const moduleName = getModuleName(node);

    if (
      node.importKind === "type" ||
      moduleName === undefined ||
      !SERVER_ONLY_MODULES.has(moduleName)
    ) {
      return [];
    }

    return [createFinding(context.file, node, {
      ruleId: "nextjs.app-router.server-import-in-client-component",
      title: "Server-only module imported by a Client Component",
      message: `${moduleName} is only available on the server and cannot be imported by a module marked "use client".`,
      severity: "high",
      suggestion: "Keep this import in a Server Component, Route Handler, or Server Action and pass only serializable data to the Client Component.",
    })];
  },
};

export const nextjsAsyncClientComponentRule: ReactRule = {
  id: "nextjs.app-router.async-client-component",
  description: "Detect async React components in App Router Client Components.",

  check(node, context) {
    if (
      !isAppRouterFile(context.file) ||
      !isClientComponent(context) ||
      !isAsyncComponent(node, context)
    ) {
      return [];
    }

    return [createFinding(context.file, node, {
      ruleId: "nextjs.app-router.async-client-component",
      title: "Async Client Component",
      message: "Client Components cannot be declared async in the Next.js App Router.",
      severity: "high",
      suggestion: "Fetch data in a Server Component and pass it as props, or use a client-side data-fetching pattern inside a synchronous Client Component.",
    })];
  },
};

export const nextjsInvalidClientDirectivePlacementRule: ReactRule = {
  id: "nextjs.app-router.invalid-client-directive-placement",
  description: "Detect use client directives that appear after another statement.",

  check(node, context) {
    if (node !== context.ast || !isAppRouterFile(context.file)) {
      return [];
    }

    const directive = findClientDirective(context.ast);

    if (directive === undefined || context.ast.body[0] === directive) {
      return [];
    }

    return [createFinding(context.file, directive, {
      ruleId: "nextjs.app-router.invalid-client-directive-placement",
      title: "Invalid use client directive placement",
      message: "The \"use client\" directive is ignored unless it is the first statement in an App Router module.",
      severity: "high",
      suggestion: "Move \"use client\" to the first statement, before every import and executable statement.",
    })];
  },
};

interface FindingDetails {
  readonly ruleId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: Severity;
  readonly suggestion: string;
}

function isClientComponent(context: ReactRuleContext): boolean {
  return context.ast.body[0] !== undefined && isClientDirective(context.ast.body[0]);
}

function isAppRouterFile(file: string): boolean {
  return /(^|\/)app(?:\/|$)/.test(file.replace(/\\/g, "/"));
}

function findClientDirective(
  ast: TSESTree.Program,
): TSESTree.ExpressionStatement | undefined {
  return ast.body.find(isClientDirective);
}

function isClientDirective(
  node: TSESTree.Node,
): node is TSESTree.ExpressionStatement {
  return (
    node.type === "ExpressionStatement" &&
    node.expression.type === "Literal" &&
    node.expression.value === CLIENT_DIRECTIVE
  );
}

function getModuleName(node: TSESTree.ImportDeclaration): string | undefined {
  return typeof node.source.value === "string" ? node.source.value : undefined;
}

function isAsyncComponent(
  node: TSESTree.Node,
  context: ReactRuleContext,
): boolean {
  if (isAnonymousDefaultAsyncFunction(node)) {
    return true;
  }

  if (
    (node.type !== "FunctionDeclaration" && node.type !== "ArrowFunctionExpression") ||
    !node.async
  ) {
    return false;
  }

  return context.hooks.components.components.some(
    (component) => component.node === node,
  );
}

function isAnonymousDefaultAsyncFunction(node: TSESTree.Node): boolean {
  return (
    node.type === "ExportDefaultDeclaration" &&
    node.declaration.type === "FunctionDeclaration" &&
    node.declaration.id === null &&
    node.declaration.async
  );
}

function isNextNavigationClientHook(
  node: TSESTree.CallExpression,
  context: ReactRuleContext,
): boolean {
  if (node.callee.type !== "Identifier") {
    return false;
  }

  const localName = node.callee.name;

  return context.ast.body.some((statement) => {
    if (
      statement.type !== "ImportDeclaration" ||
      getModuleName(statement) !== "next/navigation"
    ) {
      return false;
    }

    return statement.specifiers.some((specifier) => (
      specifier.type === "ImportSpecifier" &&
      specifier.local.name === localName &&
      specifier.imported.type === "Identifier" &&
      NEXT_NAVIGATION_CLIENT_HOOKS.has(specifier.imported.name)
    ));
  });
}

function getCallName(node: TSESTree.CallExpression): string | undefined {
  return node.callee.type === "Identifier" ? node.callee.name : undefined;
}

function createFinding(
  file: string,
  node: TSESTree.Node,
  details: FindingDetails,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [details.ruleId, file, line, column].join(":"),
    ruleId: details.ruleId,
    title: details.title,
    message: details.message,
    severity: details.severity,
    source: "ast",
    confidence: 1,
    location: { file, line, column },
    suggestion: details.suggestion,
  };
}
