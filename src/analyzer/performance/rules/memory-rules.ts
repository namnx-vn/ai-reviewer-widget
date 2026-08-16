import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, visit } from "./ast-utils";

const CLEANUP_METHODS = new Set(["close", "destroy", "end", "dispose", "release"]);
const RESOURCE_CREATORS = new Set(["open", "createReadStream", "createWriteStream", "connect", "createConnection"]);

const unboundedCacheRule: PerformanceRule = {
  meta: meta(
    "performance.memory.unbounded-cache",
    "Unbounded persistent cache",
    "A module-level cache-like Map or Set grows without eviction or size-bound evidence.",
  ),
  check(context) {
    return persistentCollections(context.ast, context.source)
      .filter((collection) => /cache|memo|store/i.test(collection.name)
        && collection.grows
        && !collection.bounded)
      .map((collection) => finding(
        this,
        context,
        collection.node,
        this.meta.description,
        "Use an evicting cache with an explicit maximum size or TTL.",
      ));
  },
};

const unboundedMapSetRule: PerformanceRule = {
  meta: meta(
    "performance.memory.unbounded-map-set",
    "Persistent unbounded collection",
    "A module-level Map or Set grows without cleanup or configured bound evidence.",
  ),
  check(context) {
    return persistentCollections(context.ast, context.source)
      .filter((collection) => collection.grows && !collection.bounded)
      .map((collection) => finding(
        this,
        context,
        collection.node,
        this.meta.description,
        "Use an evicting collection or apply an explicit maximum size.",
      ));
  },
};

const listenerLeakRule: PerformanceRule = {
  meta: meta(
    "performance.memory.listener-leak",
    "Listener without cleanup",
    "An event listener is added in a lifecycle function without matching removal evidence.",
  ),
  check(context) {
    return lifecycleCalls(context.ast, "addEventListener", "removeEventListener")
      .map((node) => finding(
        this,
        context,
        node,
        this.meta.description,
        "Remove the listener in the corresponding lifecycle cleanup path.",
      ));
  },
};

const timerLeakRule: PerformanceRule = {
  meta: meta(
    "performance.memory.timer-leak",
    "Timer without cleanup",
    "A repeating or delayed timer is created in a lifecycle function without matching cleanup evidence.",
  ),
  check(context) {
    const setIntervalLeaks = lifecycleCalls(context.ast, "setInterval", "clearInterval");
    const setTimeoutLeaks = lifecycleCalls(context.ast, "setTimeout", "clearTimeout");
    return [...setIntervalLeaks, ...setTimeoutLeaks].map((node) => finding(
      this,
      context,
      node,
      this.meta.description,
      "Clear the timer in the corresponding lifecycle or resource cleanup path.",
    ));
  },
};

const largeBufferRetentionRule: PerformanceRule = {
  meta: meta(
    "performance.memory.large-buffer-retention",
    "Persistent large buffer retention",
    "A module-level buffer allocation has a statically large size and can remain retained for the process lifetime.",
    "high",
  ),
  check(context) {
    return context.ast.body.flatMap((statement) => {
      if (statement.type !== "VariableDeclaration") return [];
      return statement.declarations.flatMap((declaration) => {
        const init = declaration.init;
        if (init === null || !isLargeBufferAllocation(init)) return [];
        return [finding(
          this,
          context,
          init,
          this.meta.description,
          "Allocate the buffer close to its bounded use or release references after use.",
        )];
      });
    });
  },
};

const missingCleanupRule: PerformanceRule = {
  meta: {
    id: "performance.resource.missing-cleanup",
    title: "Resource without cleanup",
    description: "A resource creator is used in a function without close/destroy/end/release evidence.",
    category: "resource",
    defaultSeverity: "high",
    defaultConfidence: "medium",
  },
  check(context) {
    const findings: PerformanceFinding[] = [];
    for (const body of functionBodies(context.ast)) {
      let hasCleanup = false;
      const resources: TSESTree.CallExpression[] = [];
      visit(body, (node) => {
        if (node.type !== "CallExpression") return;
        const name = callName(node) ?? "";
        if (CLEANUP_METHODS.has(name)) hasCleanup = true;
        if (RESOURCE_CREATORS.has(name)) resources.push(node);
      });
      if (hasCleanup) continue;
      resources.forEach((node) => findings.push(finding(
        this,
        context,
        node,
        this.meta.description,
        "Close or release the resource in a finally block or explicit lifecycle cleanup.",
      )));
    }
    return unique(findings);
  },
};

export const memoryPerformanceRules: readonly PerformanceRule[] = [
  unboundedCacheRule,
  unboundedMapSetRule,
  listenerLeakRule,
  timerLeakRule,
  largeBufferRetentionRule,
  missingCleanupRule,
];

interface PersistentCollection {
  readonly name: string;
  readonly node: TSESTree.NewExpression;
  readonly grows: boolean;
  readonly bounded: boolean;
}

function persistentCollections(
  ast: TSESTree.Program,
  source: string,
): readonly PersistentCollection[] {
  const result: PersistentCollection[] = [];
  for (const statement of ast.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== "Identifier" || declaration.init?.type !== "NewExpression") continue;
      if (declaration.init.callee.type !== "Identifier" || !["Map", "Set"].includes(declaration.init.callee.name)) continue;
      const name = declaration.id.name;
      let grows = false;
      let bounded = false;
      visit(ast, (node) => {
        if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.object.type !== "Identifier" || node.callee.object.name !== name) return;
        const method = callName(node) ?? "";
        if (["set", "add"].includes(method)) grows = true;
        if (["delete", "clear", "shift", "pop"].includes(method)) bounded = true;
      });
      if (new RegExp(`${escapeRegExp(name)}\\.size\\s*[><=]`, "u").test(source)) bounded = true;
      result.push({ name, node: declaration.init, grows, bounded });
    }
  }
  return result;
}

function lifecycleCalls(
  ast: TSESTree.Program,
  createName: string,
  cleanupName: string,
): readonly TSESTree.CallExpression[] {
  const findings: TSESTree.CallExpression[] = [];
  for (const body of functionBodies(ast)) {
    const creates: TSESTree.CallExpression[] = [];
    let cleaned = false;
    visit(body, (node) => {
      if (node.type !== "CallExpression") return;
      const name = callName(node);
      if (name === createName) creates.push(node);
      if (name === cleanupName) cleaned = true;
    });
    if (!cleaned) findings.push(...creates);
  }
  return uniqueNodes(findings);
}

function functionBodies(ast: TSESTree.Program): readonly TSESTree.Node[] {
  const bodies: TSESTree.Node[] = [ast];
  visit(ast, (node) => {
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") bodies.push(node.body);
  });
  return bodies;
}

function isLargeBufferAllocation(node: TSESTree.Expression): boolean {
  if (node.type === "NewExpression" && node.callee.type === "Identifier" && ["Uint8Array", "ArrayBuffer"].includes(node.callee.name)) {
    return numericArgument(node.arguments[0]) >= 1024 * 1024;
  }
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && node.callee.object.name === "Buffer" && ["alloc", "allocUnsafe"].includes(callName(node) ?? "")) {
    return numericArgument(node.arguments[0]) >= 1024 * 1024;
  }
  return false;
}

function numericArgument(argument: TSESTree.CallExpressionArgument | undefined): number {
  return argument?.type === "Literal" && typeof argument.value === "number" ? argument.value : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function meta(
  id: string,
  title: string,
  description: string,
  severity: "high" | "medium" = "medium",
): PerformanceRule["meta"] {
  return {
    id,
    title,
    description,
    category: "memory",
    defaultSeverity: severity,
    defaultConfidence: "medium",
  };
}

function uniqueNodes(nodes: readonly TSESTree.CallExpression[]): readonly TSESTree.CallExpression[] {
  return [...new Map(nodes.map((node) => [node.range?.[0] ?? -1, node])).values()];
}

function unique(findings: readonly PerformanceFinding[]): readonly PerformanceFinding[] {
  return [...new Map(findings.map((item) => [item.id, item])).values()];
}
