import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { createPerformanceFindingId } from "../engine/finding-id";
import type { PerformanceFinding, PerformanceRule, PerformanceRuleContext } from "../model/types";

const HEAVY_LIBRARIES = new Set(["lodash", "moment", "rxjs", "date-fns", "@mui/material", "antd"]);
const BARREL_SEGMENTS = new Set(["index", "components", "utils"]);

export const importPerformanceRules: readonly PerformanceRule[] = [
  createImportRule(
    "performance.large-import",
    "Large runtime import",
    "medium",
    (node) => node.specifiers.length >= 8,
    "A single runtime import exposes many bindings and can increase shipped code.",
  ),
  duplicateDependencyRule,
  createImportRule(
    "performance.barrel-overimport",
    "Barrel import",
    "low",
    (node) => node.specifiers.length >= 4 && node.source.value.split("/").some((segment) => BARREL_SEGMENTS.has(segment)),
    "A wide barrel import can pull unrelated runtime modules into an entrypoint.",
  ),
  createImportRule(
    "performance.heavy-library-whole-import",
    "Whole heavy-library import",
    "high",
    (node) => HEAVY_LIBRARIES.has(node.source.value) && node.specifiers.some((specifier) => specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier"),
    "A whole-library runtime import prevents narrow import evidence.",
  ),
  duplicateRuntimeLibraryRule,
];

const duplicateDependencyRule: PerformanceRule = {
  meta: {
    id: "performance.duplicate-dependency",
    title: "Multiple installed dependency versions",
    description: "A runtime dependency is represented by multiple installed versions in package metadata.",
    category: "bundle",
    defaultSeverity: "medium",
    defaultConfidence: "high",
  },
  check(context) {
    const versions = context.repository?.dependencyVersions;
    if (versions === undefined || versions.size === 0) return [];

    return runtimeImports(context).flatMap((node) => {
      const root = packageRoot(node.source.value);
      if (root === undefined) return [];
      const installed = versions.get(root) ?? [];
      if (installed.length < 2) return [];
      return [createFinding(
        this,
        context,
        node,
        `Dependency "${root}" is installed at multiple versions: ${installed.join(", ")}.`,
        "Align transitive constraints or deduplicate the dependency graph before shipping it.",
      )];
    });
  },
};

const duplicateRuntimeLibraryRule: PerformanceRule = {
  meta: {
    id: "performance.duplicate-runtime-library",
    title: "Duplicate runtime library entrypoints",
    description: "The same package is imported through multiple runtime entrypoints in one module.",
    category: "bundle",
    defaultSeverity: "low",
    defaultConfidence: "high",
  },
  check(context) {
    const imports = runtimeImports(context);
    const sourcesByRoot = new Map<string, Set<string>>();
    for (const node of imports) {
      const root = packageRoot(node.source.value);
      if (root === undefined) continue;
      const sources = sourcesByRoot.get(root) ?? new Set<string>();
      sources.add(node.source.value);
      sourcesByRoot.set(root, sources);
    }

    return imports.flatMap((node) => {
      const root = packageRoot(node.source.value);
      if (root === undefined || (sourcesByRoot.get(root)?.size ?? 0) < 2) return [];
      return [createFinding(
        this,
        context,
        node,
        `Package "${root}" is imported through multiple runtime entrypoints in this module.`,
        "Prefer one documented import surface so bundlers can reason about a single runtime dependency boundary.",
      )];
    });
  },
};

function createImportRule(
  id: string,
  title: string,
  severity: "high" | "medium" | "low",
  predicate: (node: TSESTree.ImportDeclaration) => boolean,
  message: string,
): PerformanceRule {
  return {
    meta: {
      id,
      title,
      description: message,
      category: "bundle",
      defaultSeverity: severity,
      defaultConfidence: "high",
    },
    check(context) {
      return runtimeImports(context).flatMap((statement) =>
        predicate(statement)
          ? [createFinding(this, context, statement, message, "Import only the runtime bindings required by this module.")]
          : [],
      );
    },
  };
}

function runtimeImports(context: PerformanceRuleContext): readonly TSESTree.ImportDeclaration[] {
  return context.ast.body.filter(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === "ImportDeclaration" && statement.importKind !== "type",
  );
}

function createFinding(
  rule: PerformanceRule,
  context: PerformanceRuleContext,
  node: TSESTree.ImportDeclaration,
  message: string,
  suggestion: string,
): PerformanceFinding {
  const range = toRange(node);
  const location = {
    path: context.file,
    line: node.loc?.start.line,
    column: node.loc?.start.column,
    range,
  };
  return {
    id: createPerformanceFindingId({ ruleId: rule.meta.id, path: context.file, range }),
    ruleId: rule.meta.id,
    title: rule.meta.title,
    message,
    severity: rule.meta.defaultSeverity,
    confidence: rule.meta.defaultConfidence,
    category: "bundle",
    location,
    evidence: [{ message: `Runtime import from "${node.source.value}".`, location }],
    suggestion,
  };
}

function packageRoot(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return undefined;
  const segments = specifier.split("/");
  return specifier.startsWith("@") && segments.length >= 2
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
}

function toRange(node: TSESTree.Node): { readonly start: number; readonly end: number } | undefined {
  return node.range ? { start: node.range[0], end: node.range[1] } : undefined;
}
