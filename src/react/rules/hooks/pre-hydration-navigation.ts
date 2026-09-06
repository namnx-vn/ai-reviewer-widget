import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";

const RULE_ID = "react.hooks.browser-subscription-gap";

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type EffectCallback = TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

interface BrowserStateBinding {
  readonly setterName: string;
  readonly sourceRoot: string;
  readonly snapshotSignature: string;
}

export const reactHooksBrowserSubscriptionGapRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect browser snapshots read during render whose passive event subscription can miss a pre-hydration change.",

  check(node, context): ReviewFinding[] {
    if (!isFunctionLike(node)) return [];

    const findings: ReviewFinding[] = [];
    const effects = collectEffectCalls(node.body);
    for (const binding of collectBrowserStateBindings(node.body)) {
      for (const effect of effects) {
        const callback = effectCallback(effect);
        if (
          callback === undefined ||
          !containsBrowserSubscription(callback.body, binding) ||
          !containsSetterSnapshot(callback.body, binding) ||
          hasDirectReconciliation(callback.body, binding)
        ) continue;

        findings.push(createFinding(
          context.file,
          effect,
          "Browser state can change before hydration subscribes",
          "State is initialized from a browser snapshot during render, but the passive listener attaches later without reconciling the snapshot. A navigation or browser event before hydration can therefore be missed.",
          "Re-read and reconcile the browser snapshot before attaching the listener, or use a hydration-aware subscription primitive that validates the initial snapshot.",
        ));
      }
    }

    return findings;
  },
};

function collectBrowserStateBindings(node: TSESTree.Node): readonly BrowserStateBinding[] {
  const bindings: BrowserStateBinding[] = [];
  visit(node, (child) => {
    if (
      child.type !== "VariableDeclarator" ||
      child.id.type !== "ArrayPattern" ||
      child.init?.type !== "CallExpression" ||
      callName(child.init) !== "useState"
    ) return;

    const setter = child.id.elements[1];
    const initializer = child.init.arguments[0];
    if (
      setter?.type !== "Identifier" ||
      initializer === undefined ||
      initializer.type === "SpreadElement" ||
      (initializer.type !== "ArrowFunctionExpression" && initializer.type !== "FunctionExpression")
    ) return;

    const snapshot = returnedExpression(initializer);
    if (snapshot?.type !== "MemberExpression") return;

    const sourceRoot = rootIdentifier(snapshot);
    if (
      sourceRoot !== "window" &&
      sourceRoot !== "document" &&
      sourceRoot !== "location" &&
      sourceRoot !== "navigator"
    ) return;

    bindings.push({
      setterName: setter.name,
      sourceRoot,
      snapshotSignature: expressionSignature(snapshot),
    });
  });
  return bindings;
}

function containsBrowserSubscription(
  node: TSESTree.Node,
  binding: BrowserStateBinding,
): boolean {
  let found = false;
  visit(node, (child) => {
    if (
      child.type === "CallExpression" &&
      child.callee.type === "MemberExpression" &&
      rootIdentifier(child.callee.object) === binding.sourceRoot &&
      memberPropertyName(child.callee) === "addEventListener"
    ) found = true;
  });
  return found;
}

function containsSetterSnapshot(
  node: TSESTree.Node,
  binding: BrowserStateBinding,
): boolean {
  let found = false;
  visit(node, (child) => {
    if (
      child.type !== "CallExpression" ||
      child.callee.type !== "Identifier" ||
      child.callee.name !== binding.setterName
    ) return;

    const value = child.arguments[0];
    if (
      value !== undefined &&
      value.type !== "SpreadElement" &&
      expressionSignature(value) === binding.snapshotSignature
    ) found = true;
  });
  return found;
}

function hasDirectReconciliation(
  node: TSESTree.Node,
  binding: BrowserStateBinding,
): boolean {
  let found = false;
  visitWithoutNestedFunctions(node, (child) => {
    if (
      child.type !== "CallExpression" ||
      child.callee.type !== "Identifier" ||
      child.callee.name !== binding.setterName
    ) return;

    const value = child.arguments[0];
    if (
      value !== undefined &&
      value.type !== "SpreadElement" &&
      expressionSignature(value) === binding.snapshotSignature
    ) found = true;
  });
  return found;
}

function collectEffectCalls(node: TSESTree.Node): readonly TSESTree.CallExpression[] {
  const effects: TSESTree.CallExpression[] = [];
  visit(node, (child) => {
    if (child.type === "CallExpression" && callName(child) === "useEffect") {
      effects.push(child);
    }
  });
  return effects;
}

function effectCallback(node: TSESTree.CallExpression): EffectCallback | undefined {
  const callback = node.arguments[0];
  return callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression"
    ? callback
    : undefined;
}

function returnedExpression(node: EffectCallback): TSESTree.Expression | undefined {
  if (node.body.type !== "BlockStatement") return node.body;
  const returned = node.body.body.find(
    (statement): statement is TSESTree.ReturnStatement => statement.type === "ReturnStatement",
  );
  return returned?.argument ?? undefined;
}

function expressionSignature(node: TSESTree.Node): string {
  if (node.type === "Identifier") return `id:${node.name}`;
  if (node.type === "MemberExpression") {
    return `member:${expressionSignature(node.object)}.${memberPropertyName(node) ?? "?"}`;
  }
  return node.type;
}

function callName(node: TSESTree.CallExpression): string | undefined {
  if (node.callee.type === "Identifier") return node.callee.name;
  return node.callee.type === "MemberExpression" ? memberPropertyName(node.callee) : undefined;
}

function memberPropertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return undefined;
}

function rootIdentifier(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  return node.type === "MemberExpression" ? rootIdentifier(node.object) : undefined;
}

function isFunctionLike(node: TSESTree.Node): node is FunctionLike {
  return node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}

function createFinding(
  file: string,
  node: TSESTree.Node,
  title: string,
  message: string,
  suggestion: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;
  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title,
    message,
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion,
    confidence: 0.98,
  };
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

function visitWithoutNestedFunctions(
  node: TSESTree.Node,
  visitor: (node: TSESTree.Node) => void,
): void {
  visitor(node);
  for (const value of Object.values(node)) {
    if (isNode(value)) {
      if (!isFunctionLike(value)) visitWithoutNestedFunctions(value, visitor);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item) && !isFunctionLike(item)) visitWithoutNestedFunctions(item, visitor);
      }
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}
