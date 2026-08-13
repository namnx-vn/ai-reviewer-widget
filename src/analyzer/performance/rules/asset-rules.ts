import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { PerformanceFinding, PerformanceRule } from "../model/types";
import { finding, visit } from "./ast-utils";

export const assetPerformanceRules: readonly PerformanceRule[] = [
  imageOptimizationRule,
  imageMissingLazyRule,
  imageMissingDimensionsRule,
  oversizedSourcePatternRule,
  eagerNoncriticalAssetRule,
];

const imageOptimizationRule = imageRule(
  "performance.image",
  "Unoptimized image delivery pattern",
  "A raw image element lacks both lazy-loading and stable dimension evidence.",
  (node) => !hasLazy(node) && !hasDimensions(node) && !hasPriority(node),
  "Add delivery hints and stable dimensions, or use the framework image abstraction when available.",
);

const imageMissingLazyRule = imageRule(
  "performance.image.missing-lazy",
  "Image missing lazy loading",
  "A non-priority image has no loading=\"lazy\" attribute.",
  (node) => !hasLazy(node) && !hasPriority(node),
  "Add loading=\"lazy\" unless this image is explicitly critical.",
);

const imageMissingDimensionsRule = imageRule(
  "performance.image.missing-dimensions",
  "Image missing dimensions",
  "An image has no width and height evidence, risking layout shifts.",
  (node) => !hasDimensions(node),
  "Provide width and height, or an equivalent stable aspect-ratio container.",
);

const oversizedSourcePatternRule = imageRule(
  "performance.image.oversized-source-pattern",
  "Potential oversized image source",
  "An image source name explicitly indicates a raw, original, full-size, or 4K asset.",
  (node) => {
    const source = literalAttribute(node, "src");
    return source !== undefined && /(?:^|[-_.\/])(raw|original|full[-_]?size|4k|uhd)(?:[-_.\/]|$)/i.test(source);
  },
  "Serve an appropriately sized derivative for the rendered image slot.",
);

const eagerNoncriticalAssetRule: PerformanceRule = {
  meta: {
    id: "performance.asset.eager-noncritical",
    title: "Eager noncritical asset",
    description: "A noncritical asset family is synchronously imported into the initial module.",
    category: "assets",
    defaultSeverity: "low",
    defaultConfidence: "medium",
  },
  check(context) {
    return context.ast.body.flatMap((node) => {
      if (node.type !== "ImportDeclaration" || node.importKind === "type") return [];
      if (!/(?:^|\/)(?:backgrounds?|marketing|reports?|exports?|optional)(?:\/|$)/i.test(node.source.value)) return [];
      if (!/\.(?:png|jpe?g|webp|avif|svg|gif|pdf)$/i.test(node.source.value)) return [];
      return [finding(
        this,
        context,
        node,
        this.meta.description,
        "Load the asset from the feature boundary that needs it instead of the initial module.",
      )];
    });
  },
};

function imageRule(
  id: string,
  title: string,
  message: string,
  predicate: (node: TSESTree.JSXOpeningElement) => boolean,
  suggestion: string,
): PerformanceRule {
  return {
    meta: {
      id,
      title,
      description: message,
      category: "assets",
      defaultSeverity: "low",
      defaultConfidence: "high",
    },
    check(context) {
      const findings: PerformanceFinding[] = [];
      visit(context.ast, (node) => {
        if (!isImage(node) || !predicate(node)) return;
        findings.push(finding(this, context, node, message, suggestion));
      });
      return findings;
    },
  };
}

function isImage(node: TSESTree.Node): node is TSESTree.JSXOpeningElement {
  return node.type === "JSXOpeningElement"
    && node.name.type === "JSXIdentifier"
    && node.name.name === "img";
}

function hasLazy(node: TSESTree.JSXOpeningElement): boolean {
  return literalAttribute(node, "loading") === "lazy";
}

function hasPriority(node: TSESTree.JSXOpeningElement): boolean {
  return hasAttribute(node, "priority") || literalAttribute(node, "fetchPriority") === "high";
}

function hasDimensions(node: TSESTree.JSXOpeningElement): boolean {
  return hasAttribute(node, "width") && hasAttribute(node, "height");
}

function hasAttribute(node: TSESTree.JSXOpeningElement, name: string): boolean {
  return node.attributes.some(
    (attribute) => attribute.type === "JSXAttribute"
      && attribute.name.type === "JSXIdentifier"
      && attribute.name.name === name,
  );
}

function literalAttribute(node: TSESTree.JSXOpeningElement, name: string): string | undefined {
  const attribute = node.attributes.find(
    (candidate) => candidate.type === "JSXAttribute"
      && candidate.name.type === "JSXIdentifier"
      && candidate.name.name === name,
  );
  return attribute?.type === "JSXAttribute"
    && attribute.value?.type === "Literal"
    && typeof attribute.value.value === "string"
      ? attribute.value.value
      : undefined;
}
