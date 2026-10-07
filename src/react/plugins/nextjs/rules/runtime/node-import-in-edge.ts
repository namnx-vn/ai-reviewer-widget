import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReactRule } from "../../../../engine/react-rule";
import { getDeclaredRuntime } from "../../semantic/module";
import { hasEstablishedAppRouterContext } from "../../semantic/project";
import { getAppRouterSpecialFileRole } from "../../semantic/route-segment";
import { createNextFinding } from "../finding";

const NODE_BUILT_INS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

export const nextjsNodeImportInEdgeRuntimeRule: ReactRule = {
  id: "next.runtime.node-import-in-edge",
  description: "Detect Node.js built-in imports in explicitly Edge App Router modules.",
  rollout: "advisory",

  check(node, context) {
    if (
      node.type !== "ImportDeclaration" ||
      !hasEstablishedAppRouterContext(context.framework) ||
      getAppRouterSpecialFileRole(context.file) === undefined ||
      getDeclaredRuntime(context.ast) !== "edge" ||
      isTypeOnlyImport(node)
    ) {
      return [];
    }

    const moduleName = typeof node.source.value === "string" ? node.source.value : undefined;
    if (moduleName === undefined || !isNodeBuiltIn(moduleName)) {
      return [];
    }

    return [createNextFinding(context.file, node, {
      ruleId: "next.runtime.node-import-in-edge",
      title: "Node.js module imported by an Edge route",
      message: `${moduleName} is a Node.js built-in and is unavailable in the Edge runtime declared by this module.`,
      severity: "high",
      suggestion: "Use an Edge-compatible Web API or move this route segment to the Node.js runtime.",
    })];
  },
};

function isNodeBuiltIn(moduleName: string): boolean {
  if (moduleName.startsWith("node:")) {
    return true;
  }

  return NODE_BUILT_INS.has(moduleName.split("/")[0] ?? moduleName);
}

function isTypeOnlyImport(node: TSESTree.ImportDeclaration): boolean {
  return node.importKind === "type" ||
    (node.specifiers.length > 0 && node.specifiers.every(
      (specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type",
    ));
}
