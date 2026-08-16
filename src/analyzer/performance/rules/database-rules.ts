import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceDatabaseAdapter, PerformanceFinding, PerformanceRule } from "../model/types";
import { callPath, finding, isLoop, visit } from "./ast-utils";

const queryInLoopRule = createDatabaseRule(
  "performance.database.query-in-loop",
  "Database query in loop",
  "A configured database adapter call occurs inside a loop.",
  "Batch keys or use a set-based query when the adapter supports it.",
  (node, ancestors, adapter) => isAdapterCall(node, adapter) && ancestors.some(isLoop),
);

const nPlusOneRule: PerformanceRule = {
  meta: databaseMeta(
    "performance.database.n-plus-one",
    "Potential N+1 database access",
    "A function loads a collection and then issues another modeled database query from inside iteration.",
  ),
  check(context) {
    const findings: PerformanceFinding[] = [];
    const adapters = context.databaseAdapters ?? [];
    for (const body of functionBodies(context.ast)) {
      const topLevelCollectionQuery = hasCollectionQueryOutsideLoop(body, adapters);
      if (!topLevelCollectionQuery) continue;
      visit(body, (node, ancestors) => {
        if (node.type !== "CallExpression" || !ancestors.some(isLoop)) return;
        if (!adapters.some((adapter) => isAdapterCall(node, adapter))) return;
        findings.push(finding(
          this,
          context,
          node,
          this.meta.description,
          "Replace per-row lookups with an eager relation, join, or batched key query.",
        ));
      });
    }
    return unique(findings);
  },
};

const unboundedQueryRule = createDatabaseRule(
  "performance.database.unbounded-query",
  "Unbounded collection query",
  "A configured collection-returning query has no static bound evidence.",
  "Apply a deterministic limit/take/page size to collection-returning queries.",
  (node, _ancestors, adapter) => isCollectionCall(node, adapter) && !hasBound(node),
);

const missingPaginationRule = createDatabaseRule(
  "performance.database.missing-pagination",
  "Missing pagination",
  "A configured collection query has no pagination or continuation evidence.",
  "Specify a bounded page size and continuation strategy.",
  (node, _ancestors, adapter) => isCollectionCall(node, adapter) && !hasPagination(node),
);

const repeatedIdenticalQueryRule: PerformanceRule = {
  meta: databaseMeta(
    "performance.database.repeated-identical-query",
    "Repeated identical database query",
    "The same modeled database call with the same literal arguments is repeated in one function.",
  ),
  check(context) {
    const adapters = context.databaseAdapters ?? [];
    const findings: PerformanceFinding[] = [];
    for (const body of functionBodies(context.ast)) {
      const calls = collectAdapterCalls(body, adapters);
      const counts = new Map<string, number>();
      for (const call of calls) {
        const key = literalCallKey(call);
        if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const call of calls) {
        const key = literalCallKey(call);
        if (key !== undefined && (counts.get(key) ?? 0) > 1) {
          findings.push(finding(
            this,
            context,
            call,
            this.meta.description,
            "Reuse the first query result or coalesce identical persistence reads.",
          ));
        }
      }
    }
    return unique(findings);
  },
};

const transactionRoundtripRule: PerformanceRule = {
  meta: databaseMeta(
    "performance.database.transaction-roundtrip",
    "Excessive transaction roundtrips",
    "A configured transaction callback performs three or more modeled database calls.",
    "Prefer set-based writes or combine related operations inside the transaction adapter where semantics allow it.",
    "high",
  ),
  check(context) {
    const adapters = context.databaseAdapters ?? [];
    const findings: PerformanceFinding[] = [];
    visit(context.ast, (node) => {
      if (node.type !== "CallExpression") return;
      const transactionAdapter = adapters.find((adapter) => (adapter.transactionMethods ?? []).includes(callPath(node) ?? ""));
      if (transactionAdapter === undefined) return;
      const callback = node.arguments.find(
        (argument): argument is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression =>
          argument.type === "ArrowFunctionExpression" || argument.type === "FunctionExpression",
      );
      if (callback === undefined) return;
      const calls = collectAdapterCalls(callback.body, adapters);
      if (calls.length < 3) return;
      findings.push(finding(
        this,
        context,
        node,
        `This transaction performs ${calls.length} modeled persistence roundtrips.`,
        "Batch or combine transaction operations when correctness permits.",
      ));
    });
    return findings;
  },
};

export const databasePerformanceRules: readonly PerformanceRule[] = [
  queryInLoopRule,
  nPlusOneRule,
  unboundedQueryRule,
  missingPaginationRule,
  repeatedIdenticalQueryRule,
  transactionRoundtripRule,
];

function createDatabaseRule(
  id: string,
  title: string,
  message: string,
  suggestion: string,
  predicate: (
    node: TSESTree.CallExpression,
    ancestors: readonly TSESTree.Node[],
    adapter: PerformanceDatabaseAdapter,
  ) => boolean,
): PerformanceRule {
  return {
    meta: databaseMeta(id, title, message),
    check(context) {
      const findings: PerformanceFinding[] = [];
      const adapters = context.databaseAdapters ?? [];
      visit(context.ast, (node, ancestors) => {
        if (node.type !== "CallExpression") return;
        const adapter = adapters.find((candidate) => isAdapterCall(node, candidate));
        if (adapter !== undefined && predicate(node, ancestors, adapter)) {
          findings.push(finding(this, context, node, message, suggestion));
        }
      });
      return findings;
    },
  };
}

function databaseMeta(
  id: string,
  title: string,
  description: string,
  severity: "high" | "medium" = "high",
): PerformanceRule["meta"] {
  return {
    id,
    title,
    description,
    category: "database",
    defaultSeverity: severity,
    defaultConfidence: "high",
  };
}

function isAdapterCall(node: TSESTree.CallExpression, adapter: PerformanceDatabaseAdapter): boolean {
  const path = callPath(node);
  return path !== undefined && (
    adapter.callPaths.includes(path)
    || (adapter.collectionMethods ?? []).includes(path)
    || (adapter.transactionMethods ?? []).includes(path)
  );
}

function isCollectionCall(node: TSESTree.CallExpression, adapter: PerformanceDatabaseAdapter): boolean {
  return (adapter.collectionMethods ?? []).includes(callPath(node) ?? "");
}

function hasBound(node: TSESTree.CallExpression): boolean {
  if (node.arguments.some((argument) => argument.type === "Literal" && typeof argument.value === "number" && argument.value > 0)) return true;
  return node.arguments.some((argument) => argument.type === "ObjectExpression" && argument.properties.some((property) =>
    property.type === "Property"
    && !property.computed
    && property.key.type === "Identifier"
    && ["limit", "take", "first", "pageSize"].includes(property.key.name),
  ));
}

function hasPagination(node: TSESTree.CallExpression): boolean {
  return hasBound(node) && node.arguments.some((argument) => argument.type === "ObjectExpression" && argument.properties.some((property) =>
    property.type === "Property"
    && !property.computed
    && property.key.type === "Identifier"
    && ["cursor", "offset", "skip", "page", "after"].includes(property.key.name),
  ));
}

function hasCollectionQueryOutsideLoop(
  body: TSESTree.Node,
  adapters: readonly PerformanceDatabaseAdapter[],
): boolean {
  let found = false;
  visit(body, (node, ancestors) => {
    if (node.type !== "CallExpression" || ancestors.some(isLoop)) return;
    if (adapters.some((adapter) => isCollectionCall(node, adapter))) found = true;
  });
  return found;
}

function collectAdapterCalls(
  node: TSESTree.Node,
  adapters: readonly PerformanceDatabaseAdapter[],
): readonly TSESTree.CallExpression[] {
  const calls: TSESTree.CallExpression[] = [];
  visit(node, (child) => {
    if (child.type === "CallExpression" && adapters.some((adapter) => isAdapterCall(child, adapter))) calls.push(child);
  });
  return calls;
}

function literalCallKey(node: TSESTree.CallExpression): string | undefined {
  const path = callPath(node);
  if (path === undefined) return undefined;
  const values: string[] = [];
  for (const argument of node.arguments) {
    if (argument.type !== "Literal" || !["string", "number", "boolean"].includes(typeof argument.value)) return undefined;
    values.push(String(argument.value));
  }
  return `${path}:${values.join("|")}`;
}

function functionBodies(ast: TSESTree.Program): readonly TSESTree.Node[] {
  const bodies: TSESTree.Node[] = [ast];
  visit(ast, (node) => {
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") bodies.push(node.body);
  });
  return bodies;
}

function unique(findings: readonly PerformanceFinding[]): readonly PerformanceFinding[] {
  return [...new Map(findings.map((item) => [item.id, item])).values()];
}
