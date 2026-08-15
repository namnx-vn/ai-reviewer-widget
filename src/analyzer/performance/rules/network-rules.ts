import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { callName, finding, isLoop, visit } from "./ast-utils";

const DIRECT_REQUESTS = new Set(["fetch", "request"]);

export const networkPerformanceRules: readonly PerformanceRule[] = [
  networkWaterfallRule,
  sequentialIndependentRequestsRule,
  duplicateRequestRule,
  requestInLoopRule,
  excessiveRoundtripsRule,
];

const networkWaterfallRule = createSequentialRule(
  "performance.network-waterfall",
  "Network waterfall",
  "Independent network requests are awaited sequentially in the same function.",
  "Start independent requests before awaiting their combined result.",
);

const sequentialIndependentRequestsRule = createSequentialRule(
  "performance.network.sequential-independent-requests",
  "Sequential independent requests",
  "Two network requests have no local data-dependency evidence but are awaited in sequence.",
  "Use Promise.all when both requests are safe to run concurrently.",
);

const duplicateRequestRule: PerformanceRule = {
  meta: meta(
    "performance.network.duplicate-request",
    "Duplicate network request",
    "The same literal request is issued more than once in the same function.",
  ),
  check(context) {
    const wrappers = collectRequestWrappers(context.ast);
    const findings: PerformanceFinding[] = [];
    for (const body of functionBodies(context.ast)) {
      const requests = collectRequests(body, wrappers);
      const counts = new Map<string, number>();
      for (const request of requests) {
        const key = requestKey(request);
        if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const request of requests) {
        const key = requestKey(request);
        if (key !== undefined && (counts.get(key) ?? 0) > 1) {
          findings.push(finding(
            this,
            context,
            request,
            this.meta.description,
            "Coalesce or cache the request result where response semantics allow it.",
          ));
        }
      }
    }
    return unique(findings);
  },
};

const requestInLoopRule: PerformanceRule = {
  meta: meta(
    "performance.network.request-in-loop",
    "Network request in loop",
    "A request is issued per loop iteration.",
  ),
  check(context) {
    const wrappers = collectRequestWrappers(context.ast);
    const findings: PerformanceFinding[] = [];
    visit(context.ast, (node, ancestors) => {
      if (node.type !== "CallExpression" || !isRequest(node, wrappers) || !ancestors.some(isLoop)) return;
      findings.push(finding(
        this,
        context,
        node,
        this.meta.description,
        "Batch the request or use bounded concurrency.",
      ));
    });
    return findings;
  },
};

const excessiveRoundtripsRule: PerformanceRule = {
  meta: meta(
    "performance.network.excessive-roundtrips",
    "Excessive network roundtrips",
    "A function contains three or more direct or modeled network requests.",
  ),
  check(context) {
    const wrappers = collectRequestWrappers(context.ast);
    const findings: PerformanceFinding[] = [];
    for (const body of functionBodies(context.ast)) {
      const requests = collectRequests(body, wrappers);
      if (requests.length < 3) continue;
      const first = requests[0];
      if (first === undefined) continue;
      findings.push(finding(
        this,
        context,
        first,
        `This function issues ${requests.length} network roundtrips.`,
        "Aggregate data behind a purpose-built endpoint where practical.",
      ));
    }
    return findings;
  },
};

function createSequentialRule(
  id: string,
  title: string,
  description: string,
  suggestion: string,
): PerformanceRule {
  return {
    meta: meta(id, title, description),
    check(context) {
      const wrappers = collectRequestWrappers(context.ast);
      const findings: PerformanceFinding[] = [];
      for (const body of functionBodies(context.ast)) {
        const awaited = collectAwaitedRequests(body, wrappers);
        for (let index = 1; index < awaited.length; index += 1) {
          const previous = awaited[index - 1];
          const current = awaited[index];
          if (previous === undefined || current === undefined) continue;
          if (!areIndependent(previous, current)) continue;
          findings.push(finding(this, context, current.call, description, suggestion));
        }
      }
      return unique(findings);
    },
  };
}

interface AwaitedRequest {
  readonly call: TSESTree.CallExpression;
  readonly assignedName?: string;
  readonly argumentIdentifiers: ReadonlySet<string>;
}

function collectAwaitedRequests(
  body: TSESTree.Node,
  wrappers: ReadonlySet<string>,
): readonly AwaitedRequest[] {
  const requests: AwaitedRequest[] = [];
  visit(body, (node, ancestors) => {
    if (node.type !== "CallExpression" || !isRequest(node, wrappers)) return;
    const awaitExpression = [...ancestors].reverse().find(
      (ancestor): ancestor is TSESTree.AwaitExpression => ancestor.type === "AwaitExpression",
    );
    if (awaitExpression === undefined) return;
    requests.push({
      call: node,
      assignedName: assignedNameFor(awaitExpression, ancestors),
      argumentIdentifiers: collectIdentifiers(node.arguments),
    });
  });
  return requests.sort((left, right) => (left.call.range?.[0] ?? 0) - (right.call.range?.[0] ?? 0));
}

function assignedNameFor(
  awaitExpression: TSESTree.AwaitExpression,
  ancestors: readonly TSESTree.Node[],
): string | undefined {
  const declaration = [...ancestors].reverse().find(
    (ancestor): ancestor is TSESTree.VariableDeclarator =>
      ancestor.type === "VariableDeclarator" && ancestor.init === awaitExpression,
  );
  return declaration?.id.type === "Identifier" ? declaration.id.name : undefined;
}

function areIndependent(previous: AwaitedRequest, current: AwaitedRequest): boolean {
  if (previous.assignedName !== undefined && current.argumentIdentifiers.has(previous.assignedName)) return false;
  return true;
}

function collectIdentifiers(values: readonly TSESTree.CallExpressionArgument[]): ReadonlySet<string> {
  const identifiers = new Set<string>();
  for (const value of values) {
    if (value.type === "SpreadElement") {
      visit(value.argument, (node) => {
        if (node.type === "Identifier") identifiers.add(node.name);
      });
      continue;
    }
    visit(value, (node) => {
      if (node.type === "Identifier") identifiers.add(node.name);
    });
  }
  return identifiers;
}

function collectRequestWrappers(ast: TSESTree.Program): ReadonlySet<string> {
  const wrappers = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    visit(ast, (node) => {
      const named = namedFunction(node);
      if (named === undefined || wrappers.has(named.name)) return;
      let containsRequest = false;
      visit(named.body, (child) => {
        if (child.type === "CallExpression" && isRequest(child, wrappers)) containsRequest = true;
      });
      if (containsRequest) {
        wrappers.add(named.name);
        changed = true;
      }
    });
  }
  return wrappers;
}

function namedFunction(node: TSESTree.Node): { readonly name: string; readonly body: TSESTree.Node } | undefined {
  if (node.type === "FunctionDeclaration" && node.id !== null) return { name: node.id.name, body: node.body };
  if (node.type === "VariableDeclarator"
    && node.id.type === "Identifier"
    && node.init !== null
    && (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")) {
    return { name: node.id.name, body: node.init.body };
  }
  return undefined;
}

function functionBodies(ast: TSESTree.Program): readonly TSESTree.Node[] {
  const bodies: TSESTree.Node[] = [ast];
  visit(ast, (node) => {
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      bodies.push(node.body);
    }
  });
  return bodies;
}

function collectRequests(
  node: TSESTree.Node,
  wrappers: ReadonlySet<string>,
): readonly TSESTree.CallExpression[] {
  const result: TSESTree.CallExpression[] = [];
  visit(node, (child) => {
    if (child.type === "CallExpression" && isRequest(child, wrappers)) result.push(child);
  });
  return result;
}

function isRequest(node: TSESTree.CallExpression, wrappers: ReadonlySet<string>): boolean {
  const name = callName(node);
  return name !== undefined && (DIRECT_REQUESTS.has(name) || wrappers.has(name));
}

function requestKey(node: TSESTree.CallExpression): string | undefined {
  const name = callName(node);
  const argument = node.arguments[0];
  if (name === undefined || argument?.type !== "Literal" || typeof argument.value !== "string") return undefined;
  return `${name}:${argument.value}`;
}

function meta(id: string, title: string, description: string): PerformanceRule["meta"] {
  return {
    id,
    title,
    description,
    category: "network",
    defaultSeverity: "medium",
    defaultConfidence: "high",
  };
}

function unique(findings: readonly PerformanceFinding[]): readonly PerformanceFinding[] {
  return [...new Map(findings.map((item) => [item.id, item])).values()];
}
