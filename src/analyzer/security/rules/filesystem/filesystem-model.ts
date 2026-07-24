import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { TaintFlowAdapter, TaintSink } from "../../flow";

const REQUEST_ROOTS = new Set(["req", "request", "ctx", "event"]);
const REQUEST_SEGMENTS = new Set(["query", "body", "params", "file", "files", "pathParameters"]);
const READ_METHODS = new Set(["readFile", "readFileSync", "createReadStream", "stat", "statSync", "open", "openSync", "readdir", "readdirSync"]);
const WRITE_METHODS = new Set(["writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream", "mkdir", "mkdirSync", "rm", "rmSync", "unlink", "unlinkSync", "rename", "renameSync", "copyFile", "copyFileSync"]);

export function createFilesystemFlowAdapter(): TaintFlowAdapter {
  return {
    matchSource(node) {
      const path = memberPath(node);
      if (path !== undefined && REQUEST_ROOTS.has(path[0] ?? "") && REQUEST_SEGMENTS.has(path[1] ?? "")) {
        return { node, label: "Request-controlled filesystem path", sourceKind: "request-input", kinds: ["path"] };
      }
      return undefined;
    },
    // Canonicalization alone does not clear path taint. Containment is evaluated by the rule.
    matchSanitizer() { return undefined; },
    matchSinks(node) {
      if (node.type !== "CallExpression") return [];
      const method = lastMemberSegment(node.callee);
      const value = expressionArgument(node, 0);
      if (method === undefined || value === undefined) return [];
      if (READ_METHODS.has(method)) return [sink(node, value, "read")];
      if (WRITE_METHODS.has(method)) return [sink(node, value, "write")];
      return [];
    },
  };
}

function sink(node: TSESTree.CallExpression, value: TSESTree.Node, kind: "read" | "write"): TaintSink {
  return { family: "path", node, value, label: `Filesystem ${kind} path`, sinkKind: "filesystem-path" };
}

function expressionArgument(node: TSESTree.CallExpression, index: number): TSESTree.Node | undefined {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement" ? undefined : argument;
}

function lastMemberSegment(node: TSESTree.Node): string | undefined {
  const path = memberPath(node);
  return path === undefined || path.length === 0 ? undefined : path[path.length - 1];
}

function memberPath(node: TSESTree.Node): readonly string[] | undefined {
  if (node.type === "Identifier") return [node.name];
  if (node.type === "ChainExpression") return memberPath(node.expression);
  if (node.type !== "MemberExpression") return undefined;
  const object = memberPath(node.object);
  const property = propertyName(node.property, node.computed);
  return object === undefined || property === undefined ? undefined : [...object, property];
}

function propertyName(node: TSESTree.Node, computed: boolean): string | undefined {
  if (!computed && node.type === "Identifier") return node.name;
  return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}
