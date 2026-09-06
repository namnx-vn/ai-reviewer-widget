import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";

const STALE_PROMISE_RULE_ID = "react.hooks.stale-promise-ref";
const SUBSCRIPTION_GAP_RULE_ID = "react.hooks.external-subscription-gap";

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type EffectCallback = TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

interface PromiseRefBinding {
  readonly refName: string;
  readonly sourceRoot: string;
}

interface StoreSnapshotBinding {
  readonly setterName: string;
  readonly sourceRoot: string;
  readonly sourceSignature: string;
}

export const reactHooksStalePromiseRefRule: ReactRule = {
  id: STALE_PROMISE_RULE_ID,
  description:
    "Detect promise refs that refresh only on terminal status and can stay stale across retry transitions.",

  check(node, context): ReviewFinding[] {
    if (!isFunctionLike(node)) return [];

    const findings: ReviewFinding[] = [];
    for (const binding of collectPromiseRefBindings(node.body)) {
      if (!returnsRefCurrent(node.body, binding.refName)) continue;

      for (const effect of collectEffectCalls(node.body)) {
        if (!isStalePromiseEffect(effect, binding)) continue;
        findings.push(createFinding(
          STALE_PROMISE_RULE_ID,
          context.file,
          effect,
          "Promise ref can stay stale across retry",
          "A promise ref is refreshed only when terminal status changes, so a retry can replace the active promise while the exposed ref still points at the obsolete promise.",
          "Refresh the promise when the promise/fetch transition changes, or expose the current promise directly instead of mirroring it through a status-gated ref.",
        ));
      }
    }

    return findings;
  },
};

export const reactHooksExternalSubscriptionGapRule: ReactRule = {
  id: SUBSCRIPTION_GAP_RULE_ID,
  description:
    "Detect render-time external-store snapshots that subscribe later in useEffect without reconciling the snapshot gap.",

  check(node, context): ReviewFinding[] {
    if (!isFunctionLike(node)) return [];

    const findings: ReviewFinding[] = [];
    const effects = collectEffectCalls(node.body);
    for (const binding of collectStoreSnapshotBindings(node.body)) {
      for (const effect of effects) {
        const callback = effectCallback(effect);
        if (
          callback === undefined ||
          !subscribesToStore(callback.body, binding) ||
          hasDirectStoreReconciliation(callback.body, binding)
        ) {
          continue;
        }

        findings.push(createFinding(
          SUBSCRIPTION_GAP_RULE_ID,
          context.file,
          effect,
          "External store snapshot can miss an update before subscription",
          "State is initialized from an external store during render, but the passive effect subscribes later without first reconciling the store. Updates between the initial read and subscription can be lost.",
          "Use useSyncExternalStore, or synchronously re-read the store while attaching the subscription.",
        ));
      }
    }

    return findings;
  },
};

function collectPromiseRefBindings(node: TSESTree.Node): readonly PromiseRefBinding[] {
  const bindings: PromiseRefBinding[] = [];
  visit(node, (child) => {
    if (
      child.type !== "VariableDeclarator" ||
      child.id.type !== "Identifier" ||
      child.init?.type !== "CallExpression" ||
      callName(child.init) !== "useRef"
    ) return;

    const value = child.init.arguments[0];
    if (
      value === undefined ||
      value.type === "SpreadElement" ||
      value.type !== "MemberExpression" ||
      memberPropertyName(value) !== "promise"
    ) return;

    const sourceRoot = rootIdentifier(value.object);
    if (sourceRoot !== undefined) {
      bindings.push({ refName: child.id.name, sourceRoot });
    }
  });
  return bindings;
}

function isStalePromiseEffect(
  effect: TSESTree.CallExpression,
  binding: PromiseRefBinding,
): boolean {
  const callback = effectCallback(effect);
  const dependencies = effect.arguments[1];
  if (
    callback === undefined ||
    dependencies?.type !== "ArrayExpression" ||
    !arrayContainsMember(dependencies, binding.sourceRoot, "status") ||
    arrayContainsMember(dependencies, binding.sourceRoot, "promise") ||
    arrayContainsMember(dependencies, binding.sourceRoot, "fetchStatus")
  ) return false;

  let matched = false;
  visit(callback.body, (child) => {
    if (
      child.type === "IfStatement" &&
      containsMember(child.test, binding.sourceRoot, "status") &&
      containsPromiseRefAssignment(child.consequent, binding)
    ) matched = true;
  });
  return matched;
}

function containsPromiseRefAssignment(
  node: TSESTree.Node,
  binding: PromiseRefBinding,
): boolean {
  let found = false;
  visit(node, (child) => {
    if (
      child.type === "AssignmentExpression" &&
      child.left.type === "MemberExpression" &&
      child.left.object.type === "Identifier" &&
      child.left.object.name === binding.refName &&
      memberPropertyName(child.left) === "current" &&
      child.right.type === "MemberExpression" &&
      rootIdentifier(child.right.object) === binding.sourceRoot &&
      memberPropertyName(child.right) === "promise"
    ) found = true;
  });
  return found;
}

function returnsRefCurrent(node: TSESTree.Node, refName: string): boolean {
  let found = false;
  visit(node, (child) => {
    const value = child.type === "ReturnStatement" ? child.argument : undefined;
    if (
      value?.type === "MemberExpression" &&
      value.object.type === "Identifier" &&
      value.object.name === refName &&
      memberPropertyName(value) === "current"
    ) found = true;
  });
  return found;
}

function collectStoreSnapshotBindings(node: TSESTree.Node): readonly StoreSnapshotBinding[] {
  const bindings: StoreSnapshotBinding[] = [];
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
    if (
      snapshot?.type !== "CallExpression" ||
      snapshot.callee.type !== "MemberExpression" ||
      snapshot.callee.object.type !== "Identifier"
    ) return;

    const method = memberPropertyName(snapshot.callee);
    if (method !== "get" && method !== "getSnapshot" && method !== "getCurrentResult") return;

    bindings.push({
      setterName: setter.name,
      sourceRoot: snapshot.callee.object.name,
      sourceSignature: expressionSignature(snapshot),
    });
  });
  return bindings;
}

function subscribesToStore(node: TSESTree.Node, binding: StoreSnapshotBinding): boolean {
  let found = false;
  visit(node, (child) => {
    if (
      child.type === "CallExpression" &&
      child.callee.type === "MemberExpression" &&
      child.callee.object.type === "Identifier" &&
      child.callee.object.name === binding.sourceRoot &&
      memberPropertyName(child.callee) === "subscribe" &&
      child.arguments.some((argument) =>
        argument.type === "Identifier" && argument.name === binding.setterName,
      )
    ) found = true;
  });
  return found;
}

function hasDirectStoreReconciliation(
  node: TSESTree.Node,
  binding: StoreSnapshotBinding,
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
      expressionSignature(value) === binding.sourceSignature
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

function arrayContainsMember(
  node: TSESTree.ArrayExpression,
  root: string,
  property: string,
): boolean {
  return node.elements.some((element) =>
    element !== null &&
    element.type !== "SpreadElement" &&
    element.type === "MemberExpression" &&
    rootIdentifier(element.object) === root &&
    memberPropertyName(element) === property,
  );
}

function containsMember(node: TSESTree.Node, root: string, property: string): boolean {
  let found = false;
  visit(node, (child) => {
    if (
      child.type === "MemberExpression" &&
      rootIdentifier(child.object) === root &&
      memberPropertyName(child) === property
    ) found = true;
  });
  return found;
}

function expressionSignature(node: TSESTree.Node): string {
  if (node.type === "Identifier") return `id:${node.name}`;
  if (node.type === "MemberExpression") {
    return `member:${expressionSignature(node.object)}.${memberPropertyName(node) ?? "?"}`;
  }
  if (node.type === "CallExpression") return `call:${expressionSignature(node.callee)}`;
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
  ruleId: string,
  file: string,
  node: TSESTree.Node,
  title: string,
  message: string,
  suggestion: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;
  return {
    id: [ruleId, file, line, column].join(":"),
    ruleId,
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
