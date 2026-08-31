import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule, PerformanceRuleContext } from "../model/types";
import { callName, callPath, finding, visit } from "./ast-utils";

const CACHE_NAME = /(cache|memo|store)/i;
const CRITICAL_DATA = /(balance|transaction|ledger|payment|account)/i;
const TTL_HINT = /(ttl|maxAge|expires|expireAt|freshness|staleTime)/i;
const SINGLE_FLIGHT_HINT = /(single.?flight|inFlight|pendingRequest|dedupe)/i;

function cacheVariables(context: PerformanceRuleContext): ReadonlySet<string> {
  const names = new Set<string>();
  visit(context.ast, (node) => {
    if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier" || node.init === null) return;
    if (node.init.type === "NewExpression" && node.init.callee.type === "Identifier" && (node.init.callee.name === "Map" || node.init.callee.name === "Set")) names.add(node.id.name);
    else if (CACHE_NAME.test(node.id.name)) names.add(node.id.name);
  });
  return names;
}
function receiverAndMethod(node: TSESTree.CallExpression): readonly [string, string] | undefined { const path = callPath(node); if (path === undefined) return undefined; const parts = path.split("."); if (parts.length < 2) return undefined; return [parts.slice(0, -1).join("."), parts[parts.length - 1] ?? ""]; }
function isCacheCall(node: TSESTree.CallExpression, caches: ReadonlySet<string>, methods: readonly string[]): boolean { const target = receiverAndMethod(node); return target !== undefined && caches.has(target[0]) && methods.includes(target[1]); }
function expensiveCall(node: TSESTree.CallExpression, context: PerformanceRuleContext): boolean { const path = callPath(node); if (path === undefined) return false; return path === "fetch" || path.startsWith("axios.") || (context.databaseAdapters ?? []).some((adapter) => adapter.callPaths.includes(path)); }
function collectCalls(context: PerformanceRuleContext): readonly TSESTree.CallExpression[] { const calls: TSESTree.CallExpression[] = []; visit(context.ast, (node) => { if (node.type === "CallExpression") calls.push(node); }); return calls; }

const definitions = [
  ["performance.cache.unbounded", "Potentially unbounded cache", "A mutable in-memory cache grows without visible eviction or capacity evidence.", "Use a bounded cache with explicit eviction or maximum capacity."],
  ["performance.cache.missing-ttl", "Cache without TTL", "A cache write has no visible TTL or expiration policy.", "Configure deterministic expiration or freshness semantics for cached entries."],
  ["performance.cache.stampede-risk", "Cache stampede risk", "Cache miss work performs external I/O without visible single-flight or request de-duplication.", "Coalesce concurrent misses for the same key before issuing downstream work."],
  ["performance.cache.recompute-on-miss", "Expensive cache miss recomputation", "A cache miss path performs an expensive operation before repopulating the cache.", "Bound or de-duplicate miss recomputation and measure the downstream cost."],
  ["performance.cache.critical-data-without-freshness-policy", "Critical data cached without freshness policy", "Financially critical data is cached without visible freshness or expiry evidence.", "Define an explicit freshness policy for balance, transaction, ledger, payment, or account data."],
] as const;

export const cachePerformanceRules: readonly PerformanceRule[] = definitions.map(([id, title, message, suggestion]) => ({
  meta: { id, title, description: message, category: "cache", defaultSeverity: id === "performance.cache.critical-data-without-freshness-policy" ? "high" : "medium", defaultConfidence: id === "performance.cache.unbounded" ? "high" : "medium" },
  check(context) {
    const caches = cacheVariables(context);
    if (caches.size === 0) return [];
    const calls = collectCalls(context);
    const writes = calls.filter((call) => isCacheCall(call, caches, ["set", "add"]));
    if (writes.length === 0) return [];
    const hasEviction = calls.some((call) => isCacheCall(call, caches, ["delete", "clear", "evict", "prune"]));
    const hasTtl = TTL_HINT.test(context.source) || calls.some((call) => ["expire", "expires", "ttl", "setex", "pexpire"].includes(callName(call) ?? ""));
    const hasRead = calls.some((call) => isCacheCall(call, caches, ["get", "has"]));
    const expensive = calls.find((call) => expensiveCall(call, context));
    const results: PerformanceFinding[] = [];
    if (id === "performance.cache.unbounded" && !hasEviction && !/(maxSize|maxEntries|capacity|LRU)/.test(context.source)) results.push(finding(this, context, writes[0], message, suggestion));
    if (id === "performance.cache.missing-ttl" && !hasTtl) results.push(finding(this, context, writes[0], message, suggestion));
    if (id === "performance.cache.stampede-risk" && hasRead && expensive !== undefined && !SINGLE_FLIGHT_HINT.test(context.source)) results.push(finding(this, context, expensive, message, suggestion));
    if (id === "performance.cache.recompute-on-miss" && hasRead && expensive !== undefined) results.push(finding(this, context, expensive, message, suggestion));
    if (id === "performance.cache.critical-data-without-freshness-policy" && !hasTtl && CRITICAL_DATA.test(context.source)) results.push(finding(this, context, writes[0], message, suggestion));
    return results;
  },
}));
