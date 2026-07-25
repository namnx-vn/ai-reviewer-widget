import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { TaintKind } from "../../flow";

export type SensitiveDataClassification =
  | "credential"
  | "payment-data"
  | "pii"
  | "secret";

export function classifySensitiveDataName(
  name: string,
): readonly SensitiveDataClassification[] {
  const classifications: SensitiveDataClassification[] = [];

  if (/(?:password|pin|otp|access.?token|refresh.?token|private.?key)/i.test(name)) {
    classifications.push("credential");
  }
  if (/(?:pan|cvv|cvc|account|balance|transaction)/i.test(name)) {
    classifications.push("payment-data");
  }
  if (/(?:national|personal|ssn|tax.?id|email|phone|full.?name|date.?of.?birth|dob|address)/i.test(name)) {
    classifications.push("pii");
  }
  if (/(?:api.?key|client.?secret|encryption.?key|signing.?key|secret)/i.test(name)) {
    classifications.push("secret");
  }

  return classifications;
}

export function classifySensitiveDataNode(
  node: TSESTree.Node,
): readonly SensitiveDataClassification[] {
  const name = sensitiveName(node);
  return name === undefined ? [] : classifySensitiveDataName(name);
}

export function isSensitiveInputAccess(node: TSESTree.Node): boolean {
  if (classifySensitiveDataNode(node).length === 0) return false;
  if (node.type === "Identifier") return true;
  if (node.type !== "MemberExpression") return false;

  let target: TSESTree.Node = node.object;
  while (target.type === "MemberExpression") target = target.object;

  return target.type === "Identifier" && /^(?:req|request|input|formData)$/i.test(target.name);
}

export function toSensitiveTaintKinds(
  classifications: readonly SensitiveDataClassification[],
): readonly TaintKind[] {
  const kinds = new Set<TaintKind>();

  for (const classification of classifications) {
    if (classification === "credential") kinds.add("credential");
    else if (classification === "payment-data") kinds.add("payment-data");
    else kinds.add("secret");
  }

  return [...kinds];
}

export function isSensitiveRedactionCall(
  node: TSESTree.CallExpression,
): boolean {
  return node.callee.type === "Identifier" && /^(?:redact|mask|sanitizeSensitive)$/i.test(node.callee.name);
}

function sensitiveName(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") {
    if (!node.computed && node.property.type === "Identifier") return node.property.name;
    if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
  }
  return undefined;
}
