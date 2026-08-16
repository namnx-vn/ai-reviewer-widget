import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, isLoop, visit } from "./ast-utils";
import { isConfiguredCritical } from "./critical-path-utils";

const EXTERNAL_CALLS = new Set(["fetch", "request", "get", "post", "put", "patch", "delete"]);
const CPU_CALLS = new Set(["sort", "stringify", "parse", "hash", "encrypt", "decrypt", "sign", "verify"]);

const excessiveRoundtripsRule: PerformanceRule = {
  meta: meta(
    "performance.transaction.excessive-roundtrips",
    "Excessive critical-path roundtrips",
    "A configured critical function performs three or more external calls.",
  ),
  check(context) {
    const findings: PerformanceFinding[] = [];
    for (const critical of criticalFunctions(context.ast, context.criticalEntrypoints ?? [])) {
      const calls = externalCalls(critical.body);
      if (calls.length < 3) continue;
      const first = calls[0];
      if (first === undefined) continue;
      findings.push(finding(
        this,
        context,
        first,
        `Critical path "${critical.name}" performs ${calls.length} external roundtrips.`,
        "Coalesce independent calls or move nonessential dependencies outside the transaction path.",
      ));
    }
    return findings;
  },
};

const sequentialIndependentWorkRule: PerformanceRule = {
  meta: meta(
    "performance.transaction.sequential-independent-work",
    "Sequential independent critical work",
    "A configured critical path awaits independent literal external calls sequentially.",
  ),
  check(context) {
    const findings: PerformanceFinding[] = [];
    for (const critical of criticalFunctions(context.ast, context.criticalEntrypoints ?? [])) {
      const awaited = awaitedExternalCalls(critical.body);
      for (let index = 1; index < awaited.length; index += 1) {
        const previous = awaited[index - 1];
        const current = awaited[index];
        if (previous === undefined || current === undefined) continue;
        if (previous.assignedName !== undefined && current.identifiers.has(previous.assignedName)) continue;
        findings.push(finding(
          this,
          context,
          current.call,
          this.meta.description,
          "Start independent critical-path I/O together and await the combined bounded result.",
        ));
      }
    }
    return findings;
  },
};

const nonIdempotentRetryRule: PerformanceRule = {
  meta: meta(
    "performance.transaction.non-idempotent-retry",
    "Non-idempotent retry in critical path",
    "A configured critical path retries a non-idempotent request without visible idempotency evidence.",
    "critical",
  ),
  check(context) {
    const findings: PerformanceFinding[] = [];
    visit(context.ast, (node, ancestors) => {
      if (node.type !== "CallExpression" || callName(node) !== "fetch") return;
      if (!isConfiguredCritical(ancestors, context.criticalEntrypoints)) return;
      if (!ancestors.some(isLoop) || !isNonIdempotentFetch(node) || hasIdempotencyKey(node)) return;
      findings.push(finding(
        this,
        context,
        node,
        this.meta.description,
        "Require an idempotency key or operation-specific replay protection before retrying.",
      ));
    });
    return findings;
  },
};

export const transactionPerformanceRules: readonly PerformanceRule[] = [
  createCriticalRule(
    "performance.transaction.external-call-in-critical-section",
    "External call in critical transaction path",
    "A configured critical path issues an external request.",
    "Move nonessential work out of the critical section or use a bounded dependency boundary.",
    (node) => node.type === "CallExpression" && EXTERNAL_CALLS.has(callName(node) ?? ""),
  ),
  excessiveRoundtripsRule,
  sequentialIndependentWorkRule,
  nonIdempotentRetryRule,
  createCriticalRule(
    "performance.transaction.blocking-cpu-work",
    "Blocking CPU work in critical transaction path",
    "A configured critical path performs structurally blocking CPU work.",
    "Move expensive CPU work off the latency-critical path or precompute it where correctness permits.",
    (node, ancestors) => isBlockingCpu(node, ancestors),
  ),
  createCriticalRule(
    "performance.transaction.unbounded-fanout",
    "Unbounded fan-out in critical transaction path",
    "A configured critical path fans out dynamic concurrent work.",
    "Apply a bounded concurrency policy before entering the transaction path.",
    (node) => isDynamicPromiseAll(node),
  ),
];

function createCriticalRule(
  id: string,
  title: string,
  message: string,
  suggestion: string,
  predicate: (node: TSESTree.Node, ancestors: readonly TSESTree.Node[]) => boolean,
): PerformanceRule {
  return {
    meta: meta(id, title, message),
    check(context) {
      const findings: PerformanceFinding[] = [];
      visit(context.ast, (node, ancestors) => {
        if (!isConfiguredCritical(ancestors, context.criticalEntrypoints)) return;
        if (predicate(node, ancestors)) findings.push(finding(this, context, node, message, suggestion));
      });
      return findings;
    },
  };
}

function meta(
  id: string,
  title: string,
  description: string,
  severity: "critical" | "high" = "high",
): PerformanceRule["meta"] {
  return {
    id,
    title,
    description,
    category: "transaction",
    defaultSeverity: severity,
    defaultConfidence: "high",
  };
}

function isDynamicPromiseAll(node: TSESTree.Node): boolean {
  return node.type === "CallExpression"
    && node.callee.type === "MemberExpression"
    && !node.callee.computed
    && node.callee.object.type === "Identifier"
    && node.callee.object.name === "Promise"
    && node.callee.property.type === "Identifier"
    && node.callee.property.name === "all"
    && node.arguments[0]?.type === "CallExpression"
    && ["map", "flatMap"].includes(callName(node.arguments[0]) ?? "")
    && node.arguments[0].callee.type === "MemberExpression"
    && node.arguments[0].callee.object.type !== "ArrayExpression";
}

function isBlockingCpu(node: TSESTree.Node, ancestors: readonly TSESTree.Node[]): boolean {
  if (isLoop(node) && ancestors.some(isLoop)) return true;
  return node.type === "CallExpression" && CPU_CALLS.has(callName(node) ?? "") && ancestors.some(isLoop);
}

function criticalFunctions(
  ast: TSESTree.Program,
  names: readonly string[],
): readonly { readonly name: string; readonly body: TSESTree.Node }[] {
  const configured = new Set(names);
  if (configured.size === 0) return [];
  const result: { name: string; body: TSESTree.Node }[] = [];
  visit(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id !== null && configured.has(node.id.name)) {
      result.push({ name: node.id.name, body: node.body });
    }
    if (node.type === "VariableDeclarator"
      && node.id.type === "Identifier"
      && configured.has(node.id.name)
      && node.init !== null
      && (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")) {
      result.push({ name: node.id.name, body: node.init.body });
    }
  });
  return result;
}

function externalCalls(body: TSESTree.Node): readonly TSESTree.CallExpression[] {
  const calls: TSESTree.CallExpression[] = [];
  visit(body, (node) => {
    if (node.type === "CallExpression" && EXTERNAL_CALLS.has(callName(node) ?? "")) calls.push(node);
  });
  return calls;
}

interface AwaitedExternalCall {
  readonly call: TSESTree.CallExpression;
  readonly assignedName?: string;
  readonly identifiers: ReadonlySet<string>;
}

function awaitedExternalCalls(body: TSESTree.Node): readonly AwaitedExternalCall[] {
  const result: AwaitedExternalCall[] = [];
  visit(body, (node, ancestors) => {
    if (node.type !== "CallExpression" || !EXTERNAL_CALLS.has(callName(node) ?? "")) return;
    const awaitNode = [...ancestors].reverse().find(
      (ancestor): ancestor is TSESTree.AwaitExpression => ancestor.type === "AwaitExpression",
    );
    if (awaitNode === undefined) return;
    const declaration = [...ancestors].reverse().find(
      (ancestor): ancestor is TSESTree.VariableDeclarator => ancestor.type === "VariableDeclarator" && ancestor.init === awaitNode,
    );
    const identifiers = new Set<string>();
    node.arguments.forEach((argument) => {
      if (argument.type === "SpreadElement") return;
      visit(argument, (child) => {
        if (child.type === "Identifier") identifiers.add(child.name);
      });
    });
    result.push({
      call: node,
      assignedName: declaration?.id.type === "Identifier" ? declaration.id.name : undefined,
      identifiers,
    });
  });
  return result.sort((left, right) => (left.call.range?.[0] ?? 0) - (right.call.range?.[0] ?? 0));
}

function isNonIdempotentFetch(node: TSESTree.CallExpression): boolean {
  const options = node.arguments[1];
  if (options?.type !== "ObjectExpression") return false;
  const method = options.properties.find((property) =>
    property.type === "Property"
    && !property.computed
    && ((property.key.type === "Identifier" && property.key.name === "method")
      || (property.key.type === "Literal" && property.key.value === "method")),
  );
  return method?.type === "Property"
    && method.value.type === "Literal"
    && typeof method.value.value === "string"
    && ["POST", "PATCH", "DELETE"].includes(method.value.value.toUpperCase());
}

function hasIdempotencyKey(node: TSESTree.CallExpression): boolean {
  const options = node.arguments[1];
  if (options?.type !== "ObjectExpression") return false;
  return options.properties.some((property) => {
    if (property.type !== "Property") return false;
    const key = property.key.type === "Identifier" ? property.key.name : property.key.type === "Literal" ? String(property.key.value) : "";
    if (/idempot/i.test(key)) return true;
    if (key !== "headers" || property.value.type !== "ObjectExpression") return false;
    return property.value.properties.some((header) => {
      if (header.type !== "Property") return false;
      const headerKey = header.key.type === "Identifier" ? header.key.name : header.key.type === "Literal" ? String(header.key.value) : "";
      return /idempotency[-_]?key/i.test(headerKey);
    });
  });
}
