import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { createSecurityFindingId } from "../engine/finding-id";
import type {
  SecurityFinding,
  SecurityRule,
  SecurityRuleContext,
  SecurityRuleMeta,
} from "../model/types";

type DangerousExecutionKind =
  | "eval"
  | "indirect-eval"
  | "function-constructor"
  | "dynamic-timer"
  | "vm-execution";

interface Match {
  readonly node: TSESTree.Node;
  readonly kind: DangerousExecutionKind;
  readonly api: string;
}

interface AnalysisState {
  readonly shadowedGlobals: ReadonlySet<string>;
  readonly aliases: ReadonlyMap<string, DangerousExecutionKind>;
  readonly vmNamespaces: ReadonlySet<string>;
  readonly vmBindings: ReadonlyMap<string, string>;
}

const VM_MODULES = new Set(["vm", "node:vm"]);
const VM_EXECUTION_METHODS = new Set([
  "runInContext",
  "runInNewContext",
  "runInThisContext",
  "compileFunction",
]);

const RULE_META: Readonly<Record<DangerousExecutionKind, SecurityRuleMeta>> = {
  eval: {
    id: "security.execution.no-eval",
    title: "Direct eval execution",
    description: "Detects direct use of the global eval function.",
    category: "execution",
    defaultSeverity: "critical",
    defaultConfidence: "high",
    standards: [{ standard: "cwe", id: "CWE-95" }],
  },
  "indirect-eval": {
    id: "security.execution.no-indirect-eval",
    title: "Indirect eval execution",
    description: "Detects obvious aliases and indirect references to the global eval function.",
    category: "execution",
    defaultSeverity: "critical",
    defaultConfidence: "high",
    standards: [{ standard: "cwe", id: "CWE-95" }],
  },
  "function-constructor": {
    id: "security.execution.no-new-function",
    title: "Dynamic Function construction",
    description: "Detects use of the global Function constructor for dynamic code execution.",
    category: "execution",
    defaultSeverity: "critical",
    defaultConfidence: "high",
    standards: [{ standard: "cwe", id: "CWE-95" }],
  },
  "dynamic-timer": {
    id: "security.execution.no-dynamic-code",
    title: "String-based dynamic execution",
    description: "Detects string arguments passed to global timer APIs that evaluate code dynamically.",
    category: "execution",
    defaultSeverity: "high",
    defaultConfidence: "high",
    standards: [{ standard: "cwe", id: "CWE-95" }],
  },
  "vm-execution": {
    id: "security.execution.no-vm-execution",
    title: "Node VM code execution",
    description: "Detects explicitly modeled Node.js VM execution APIs.",
    category: "execution",
    defaultSeverity: "critical",
    defaultConfidence: "high",
    standards: [{ standard: "cwe", id: "CWE-95" }],
  },
};

export const dangerousExecutionRules: readonly SecurityRule[] = [
  createRule("eval"),
  createRule("indirect-eval"),
  createRule("function-constructor"),
  createRule("dynamic-timer"),
  createRule("vm-execution"),
];

function createRule(kind: DangerousExecutionKind): SecurityRule {
  return {
    meta: RULE_META[kind],
    check(context) {
      const matches = analyzeDangerousExecution(context);
      return matches
        .filter((match) => match.kind === kind)
        .map((match) => createFinding(context, RULE_META[kind], match));
    },
  };
}

function analyzeDangerousExecution(context: SecurityRuleContext): readonly Match[] {
  const state = buildAnalysisState(context.ast);
  const matches: Match[] = [];

  visit(context.ast, (node) => {
    if (node.type === "CallExpression") {
      inspectCall(node, state, matches);
      return;
    }

    if (node.type === "NewExpression") {
      inspectNew(node, state, matches);
    }
  });

  return matches;
}

function buildAnalysisState(ast: TSESTree.Program): AnalysisState {
  const declared = new Map<string, number>();
  const aliases = new Map<string, DangerousExecutionKind>();
  const vmNamespaces = new Set<string>();
  const vmBindings = new Map<string, string>();

  visit(ast, (node) => {
    collectDeclarations(node, declared);

    if (node.type === "ImportDeclaration" && isVmModule(node.source.value)) {
      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") {
          vmNamespaces.add(specifier.local.name);
        } else if (specifier.type === "ImportSpecifier") {
          const imported = identifierName(specifier.imported);
          if (imported !== undefined && VM_EXECUTION_METHODS.has(imported)) {
            vmBindings.set(specifier.local.name, imported);
          }
        }
      }
    }
  });

  const shadowedGlobals = new Set(
    [...declared.entries()]
      .filter(([name]) => name === "eval" || name === "Function" || name === "setTimeout" || name === "setInterval")
      .map(([name]) => name),
  );

  visit(ast, (node) => {
    if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier" || node.init === null) {
      return;
    }

    const kind = classifyReference(node.init, shadowedGlobals, vmNamespaces, vmBindings);
    if (kind !== undefined && (declared.get(node.id.name) ?? 0) === 1) {
      aliases.set(node.id.name, kind === "eval" ? "indirect-eval" : kind);
    }
  });

  return { shadowedGlobals, aliases, vmNamespaces, vmBindings };
}

function inspectCall(
  node: TSESTree.CallExpression,
  state: AnalysisState,
  matches: Match[],
): void {
  const callee = unwrapChain(node.callee);

  if (callee.type === "Identifier") {
    const aliasKind = state.aliases.get(callee.name);
    if (aliasKind !== undefined) {
      matches.push({ node, kind: aliasKind, api: callee.name });
      return;
    }

    if (callee.name === "eval" && !state.shadowedGlobals.has("eval")) {
      matches.push({ node, kind: "eval", api: "eval" });
      return;
    }

    if (callee.name === "Function" && !state.shadowedGlobals.has("Function")) {
      matches.push({ node, kind: "function-constructor", api: "Function" });
      return;
    }

    const vmMethod = state.vmBindings.get(callee.name);
    if (vmMethod !== undefined) {
      matches.push({ node, kind: "vm-execution", api: vmMethod });
      return;
    }

    if (isDynamicTimer(callee.name, node.arguments, state.shadowedGlobals)) {
      matches.push({ node, kind: "dynamic-timer", api: callee.name });
    }

    return;
  }

  const member = memberName(callee);
  if (member === undefined) {
    if (isIndirectEvalSequence(callee, state.shadowedGlobals)) {
      matches.push({ node, kind: "indirect-eval", api: "eval" });
    }
    return;
  }

  if (member.object === "globalThis" || member.object === "window") {
    if (member.property === "eval") {
      matches.push({ node, kind: "eval", api: `${member.object}.eval` });
      return;
    }
    if (member.property === "Function") {
      matches.push({ node, kind: "function-constructor", api: `${member.object}.Function` });
      return;
    }
    if (isDynamicTimer(member.property, node.arguments, new Set())) {
      matches.push({ node, kind: "dynamic-timer", api: `${member.object}.${member.property}` });
    }
    return;
  }

  if (state.vmNamespaces.has(member.object) && VM_EXECUTION_METHODS.has(member.property)) {
    matches.push({ node, kind: "vm-execution", api: `${member.object}.${member.property}` });
  }
}

function inspectNew(
  node: TSESTree.NewExpression,
  state: AnalysisState,
  matches: Match[],
): void {
  const callee = unwrapChain(node.callee);
  if (callee.type === "Identifier") {
    const aliasKind = state.aliases.get(callee.name);
    if (aliasKind === "function-constructor") {
      matches.push({ node, kind: aliasKind, api: callee.name });
      return;
    }
    if (callee.name === "Function" && !state.shadowedGlobals.has("Function")) {
      matches.push({ node, kind: "function-constructor", api: "Function" });
    }
    return;
  }

  const member = memberName(callee);
  if (member !== undefined && (member.object === "globalThis" || member.object === "window") && member.property === "Function") {
    matches.push({ node, kind: "function-constructor", api: `${member.object}.Function` });
  }
}

function classifyReference(
  node: TSESTree.Expression,
  shadowedGlobals: ReadonlySet<string>,
  vmNamespaces: ReadonlySet<string>,
  vmBindings: ReadonlyMap<string, string>,
): DangerousExecutionKind | undefined {
  const expression = unwrapChain(node);
  if (expression.type === "Identifier") {
    if (expression.name === "eval" && !shadowedGlobals.has("eval")) return "eval";
    if (expression.name === "Function" && !shadowedGlobals.has("Function")) return "function-constructor";
    if (vmBindings.has(expression.name)) return "vm-execution";
    return undefined;
  }

  const member = memberName(expression);
  if (member === undefined) return undefined;
  if ((member.object === "globalThis" || member.object === "window") && member.property === "eval") return "eval";
  if ((member.object === "globalThis" || member.object === "window") && member.property === "Function") return "function-constructor";
  if (vmNamespaces.has(member.object) && VM_EXECUTION_METHODS.has(member.property)) return "vm-execution";
  return undefined;
}

function collectDeclarations(node: TSESTree.Node, declared: Map<string, number>): void {
  if (node.type === "VariableDeclarator") collectPatternNames(node.id, declared);
  if (node.type === "FunctionDeclaration" && node.id !== null) addName(node.id.name, declared);
  if (node.type === "ClassDeclaration" && node.id !== null) addName(node.id.name, declared);
  if (node.type === "ImportDeclaration") {
    for (const specifier of node.specifiers) addName(specifier.local.name, declared);
  }
  if (node.type === "CatchClause" && node.param !== null) collectPatternNames(node.param, declared);
  if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
    for (const parameter of node.params) collectPatternNames(parameter as TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern, declared);
  }
}

function collectPatternNames(pattern: TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern, declared: Map<string, number>): void {
  if (pattern.type === "Identifier") {
    addName(pattern.name, declared);
    return;
  }
  if (pattern.type === "RestElement") {
    collectPatternNames(pattern.argument as TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern, declared);
    return;
  }
  if (pattern.type === "AssignmentPattern") {
    collectPatternNames(pattern.left as TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern, declared);
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) if (element !== null) collectPatternNames(element as TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern, declared);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) {
      if (property.type === "RestElement") collectPatternNames(property.argument as TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern, declared);
      else collectPatternNames(property.value as TSESTree.BindingName | TSESTree.RestElement | TSESTree.AssignmentPattern, declared);
    }
  }
}

function addName(name: string, declared: Map<string, number>): void {
  declared.set(name, (declared.get(name) ?? 0) + 1);
}

function createFinding(context: SecurityRuleContext, meta: SecurityRuleMeta, match: Match): SecurityFinding {
  const range = toRange(match.node);
  const location = {
    path: context.file,
    line: match.node.loc?.start.line,
    column: match.node.loc?.start.column,
    range,
  };

  return {
    id: createSecurityFindingId({
      ruleId: meta.id,
      path: context.file,
      range,
      sinkKind: "code-execution",
    }),
    ruleId: meta.id,
    title: meta.title,
    message: `${match.api} can execute dynamically constructed code and should not be used with untrusted or runtime-controlled input.`,
    severity: meta.defaultSeverity,
    confidence: meta.defaultConfidence,
    category: meta.category,
    location,
    evidence: [{
      message: `Dangerous execution sink: ${match.api}`,
      location,
      sinkKind: "code-execution",
    }],
    standards: meta.standards,
    sinkKind: "code-execution",
    suggestion: "Replace dynamic code execution with explicit parsing, dispatch, or a constrained allowlisted operation.",
  };
}

function isDynamicTimer(name: string, args: readonly TSESTree.CallExpressionArgument[], shadowedGlobals: ReadonlySet<string>): boolean {
  if ((name !== "setTimeout" && name !== "setInterval") || shadowedGlobals.has(name)) return false;
  const first = args[0];
  return first?.type === "Literal" && typeof first.value === "string";
}

function isIndirectEvalSequence(node: TSESTree.Node, shadowedGlobals: ReadonlySet<string>): boolean {
  if (node.type !== "SequenceExpression" || shadowedGlobals.has("eval")) return false;
  const last = node.expressions[node.expressions.length - 1];
  return last?.type === "Identifier" && last.name === "eval";
}

function memberName(node: TSESTree.Node): { readonly object: string; readonly property: string } | undefined {
  if (node.type !== "MemberExpression" || node.object.type !== "Identifier") return undefined;
  if (!node.computed && node.property.type === "Identifier") {
    return { object: node.object.name, property: node.property.name };
  }
  if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") {
    return { object: node.object.name, property: node.property.value };
  }
  return undefined;
}

function identifierName(node: TSESTree.Identifier | TSESTree.StringLiteral): string | undefined {
  return node.type === "Identifier" ? node.name : typeof node.value === "string" ? node.value : undefined;
}

function unwrapChain(node: TSESTree.Node): TSESTree.Node {
  return node.type === "ChainExpression" ? node.expression : node;
}

function isVmModule(value: unknown): boolean {
  return typeof value === "string" && VM_MODULES.has(value);
}

function toRange(node: TSESTree.Node): { readonly start: number; readonly end: number } | undefined {
  return node.range === undefined ? undefined : { start: node.range[0], end: node.range[1] };
}

function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void {
  visitor(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) visit(value, visitor);
    else if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) visit(item, visitor);
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}
