import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { SemanticDiagnostic } from "./contracts";

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

export interface NodeEntry { readonly node: TSESTree.Node; readonly ancestors: readonly TSESTree.Node[] }

export function boundedNodes(root: TSESTree.Node, file: string, maxNodes: number, maxDepth: number): {
  readonly entries: readonly NodeEntry[];
  readonly diagnostics: readonly SemanticDiagnostic[];
} {
  const entries: NodeEntry[] = [];
  const diagnostics: SemanticDiagnostic[] = [];
  const pending: NodeEntry[] = [{ node: root, ancestors: [] }];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) break;
    if (entries.length >= maxNodes) { diagnostics.push({ file, code: "node-limit" }); break; }
    if (entry.ancestors.length > maxDepth) { diagnostics.push({ file, code: "depth-limit" }); continue; }
    entries.push(entry);
    const children = Object.entries(entry.node).flatMap(([key, value]) => {
      if (["parent", "tokens", "comments", "loc", "range"].includes(key)) return [];
      return isNode(value) ? [value] : Array.isArray(value) ? value.filter(isNode) : [];
    });
    for (const node of children.reverse()) pending.push({ node, ancestors: [...entry.ancestors, entry.node] });
  }
  return { entries, diagnostics };
}

export function bindingNames(node: TSESTree.Node): readonly string[] {
  if (node.type === "Identifier") return [node.name];
  if (node.type === "RestElement") return bindingNames(node.argument);
  if (node.type === "AssignmentPattern") return bindingNames(node.left);
  if (node.type === "ArrayPattern") return node.elements.flatMap((item) => item === null ? [] : bindingNames(item));
  if (node.type === "ObjectPattern") return node.properties.flatMap((item) => bindingNames(item.type === "RestElement" ? item.argument : item.value));
  if (node.type === "TSParameterProperty") return bindingNames(node.parameter);
  return [];
}

export function isFunction(node: TSESTree.Node): node is TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression {
  return node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}

export function conditionallyExecuted(ancestors: readonly TSESTree.Node[]): boolean {
  return ancestors.some((node) => ["IfStatement", "ConditionalExpression", "LogicalExpression", "SwitchCase", "ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "DoWhileStatement", "TryStatement"].includes(node.type));
}
