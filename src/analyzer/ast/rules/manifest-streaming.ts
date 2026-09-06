import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ASTRule } from "../rules";

const RULE_ID = "quality.web.manifest-streamed-body";

export const manifestStreamedBodyRule: ASTRule = {
  id: RULE_ID,
  description:
    "Detect web-manifest link markup emitted through streamed body metadata instead of the document head.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (
      !isNode(node) ||
      node.type !== "VariableDeclarator" ||
      node.id.type !== "Identifier" ||
      !/(?:body|streamedBody|metadataBody)/i.test(node.id.name) ||
      node.init === null ||
      !containsManifestLink(node.init)
    ) return [];

    const line = node.loc?.start.line ?? 1;
    const column = node.loc?.start.column ?? 0;
    return [{
      id: [RULE_ID, file, line, column].join(":"),
      ruleId: RULE_ID,
      title: "Web manifest is emitted through streamed body metadata",
      message:
        "A rel=manifest link is constructed in body/streamed metadata. Browsers expect manifest discovery in document head and may miss a link emitted after head streaming has completed.",
      severity: "medium",
      source: "ast",
      location: { file, line, column },
      suggestion:
        "Emit the manifest link with eagerly available/static head metadata and keep later streaming for metadata valid outside the initial head boundary.",
      confidence: 0.99,
    }];
  },
};

function containsManifestLink(node: TSESTree.Node): boolean {
  let found = false;
  visit(node, (child) => {
    if (
      child.type === "Literal" &&
      typeof child.value === "string" &&
      isManifestMarkup(child.value)
    ) {
      found = true;
      return;
    }

    if (child.type === "TemplateElement") {
      const text = child.value.cooked ?? child.value.raw;
      if (isManifestMarkup(text)) found = true;
    }
  });
  return found;
}

function isManifestMarkup(value: string): boolean {
  return /<link\b[^>]*\brel=\\?["']?manifest\\?["']?/i.test(value);
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
