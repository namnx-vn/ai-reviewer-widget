import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { SecurityLocation } from "../model/types";
import type { TaintKind, TaintStep } from "./types";

const TAINT_KIND_ORDER: readonly TaintKind[] = [
  "command",
  "sql",
  "nosql",
  "template",
  "expression",
  "crlf",
  "header",
  "ldap",
  "xpath",
  "graphql",
  "html",
  "url",
  "navigation",
  "window-open",
  "origin",
  "user-input",
  "path",
  "secret",
  "credential",
  "payment-data",
];

export function orderKinds(kinds: readonly TaintKind[]): readonly TaintKind[] {
  const kindSet = new Set(kinds);
  return TAINT_KIND_ORDER.filter((kind) => kindSet.has(kind));
}

export function dedupeSteps(steps: readonly TaintStep[]): readonly TaintStep[] {
  const seen = new Set<string>();
  const result: TaintStep[] = [];

  for (const step of steps) {
    const range = step.location?.range;
    const key = [
      step.kind,
      step.label,
      step.location?.path ?? "",
      String(range?.start ?? -1),
      String(range?.end ?? -1),
      step.sourceKind ?? "",
      step.sanitizerKind ?? "",
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(step);
  }

  return result;
}

export function getLocation(
  node: TSESTree.Node,
  file: string,
): SecurityLocation {
  return {
    path: file,
    line: node.loc?.start.line,
    column: node.loc?.start.column,
    range: node.range === undefined
      ? undefined
      : { start: node.range[0], end: node.range[1] },
  };
}

export function getChildNodes(
  node: TSESTree.Node,
): readonly TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    }
  }

  return children.sort((left, right) => (
    (left.range?.[0] ?? Number.MAX_SAFE_INTEGER) -
    (right.range?.[0] ?? Number.MAX_SAFE_INTEGER)
  ));
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value &&
    typeof value.type === "string";
}
